import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MeetingDetailResponse,
  type SpeakersResponse,
} from "@transcrib/shared";
import type { SlotContext } from "@/lib/features";
import { ApiError, apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { putSpeakers, useSpeakers } from "./api";
import {
  buildMapping,
  formatDuration,
  formatMs,
  initialChoices,
  invalidLabels,
  type Choice,
  type Choices,
} from "./mapping";

/**
 * meeting.actions slot: visible only while the meeting is AWAITING_SPEAKERS.
 * The status comes from the meeting card's query (same key, kept fresh by SSE).
 */
export function SpeakersConfirmation({ meetingId }: SlotContext) {
  const { t } = useTranslation("speakers");
  const { data: detail } = useQuery({
    queryKey: ["meetings", meetingId ?? ""],
    queryFn: () => apiGet(`/api/meetings/${meetingId}`, MeetingDetailResponse),
    enabled: !!meetingId,
    staleTime: 30_000,
  });
  const awaiting = detail?.meeting.status === "AWAITING_SPEAKERS";
  const speakers = useSpeakers(meetingId, awaiting);

  if (!meetingId || !awaiting) return null;
  if (speakers.isLoading) {
    return <p data-testid="speakers-loading">{t("loading")}</p>;
  }
  if (speakers.isError || !speakers.data) {
    return (
      <div data-testid="speakers-load-error" className="space-y-2">
        <p role="alert" className="text-sm text-red-600">
          {t("loadError")}
        </p>
        <Button variant="outline" onClick={() => void speakers.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  return <SpeakersForm meetingId={meetingId} data={speakers.data} />;
}

const OTHER = "__name";
const KEEP = "__keep";
const PARTICIPANT = "p:";
const MERGE = "m:";

function selectValue(choice: Choice): string {
  switch (choice.kind) {
    case "keep":
      return KEEP;
    case "name":
      return OTHER;
    case "participant":
      return PARTICIPANT + choice.participantId;
    case "merge":
      return MERGE + choice.target;
  }
}

function SpeakersForm({
  meetingId,
  data,
}: {
  meetingId: string;
  data: SpeakersResponse;
}) {
  const { t } = useTranslation("speakers");
  const queryClient = useQueryClient();
  const [choices, setChoices] = useState<Choices>(() =>
    initialChoices(data.labels, data.participants),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInvalid, setShowInvalid] = useState(false);

  // a refetch with a different label set must not leave a label without a choice
  useEffect(() => {
    setChoices((prev) => {
      const fresh = initialChoices(data.labels, data.participants);
      return Object.fromEntries(
        data.labels.map((l) => [l.label, prev[l.label] ?? fresh[l.label]!]),
      );
    });
  }, [data.labels, data.participants]);

  const invalid = new Set(invalidLabels(choices));

  function setChoice(label: string, choice: Choice) {
    setChoices((prev) => ({ ...prev, [label]: choice }));
  }

  function onSelect(label: string, value: string) {
    if (value === KEEP) {
      setChoice(label, { kind: "keep" });
    } else if (value === OTHER) {
      const current = choices[label];
      setChoice(label, {
        kind: "name",
        name: current?.kind === "name" ? current.name : "",
      });
    } else if (value.startsWith(PARTICIPANT)) {
      setChoice(label, {
        kind: "participant",
        participantId: value.slice(PARTICIPANT.length),
      });
    } else if (value.startsWith(MERGE)) {
      setChoice(label, { kind: "merge", target: value.slice(MERGE.length) });
    }
  }

  async function submit(action: "confirm" | "skip") {
    if (action === "confirm" && invalid.size > 0) {
      setShowInvalid(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await putSpeakers(meetingId, {
        action,
        mapping: action === "confirm" ? buildMapping(choices) : [],
      });
      // the meeting is GENERATING_PROTOCOL now; do not wait for SSE to show it
      void queryClient.invalidateQueries({ queryKey: ["meetings", meetingId] });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t("error.conflict"));
        // already confirmed elsewhere / status moved: reload the card
        void queryClient.invalidateQueries({ queryKey: ["meetings", meetingId] });
      } else if (err instanceof ApiError && err.status === 404) {
        setError(t("error.notFound"));
      } else {
        setError(t("error.generic"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="w-full space-y-4 rounded-lg border p-4"
      data-testid="speakers-confirmation"
      aria-labelledby="speakers-title"
    >
      <header className="space-y-1">
        <h2 id="speakers-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {t("intro")}
        </p>
        <p
          className="text-xs text-[var(--color-muted-foreground)]"
          data-testid="speakers-split-hint"
        >
          {t("splitHint")}
        </p>
      </header>

      <ul className="space-y-4">
        {data.labels.map((l, index) => {
          const choice = choices[l.label] ?? { kind: "keep" as const };
          const showError = showInvalid && invalid.has(l.label);
          return (
            <li
              key={l.label}
              className="space-y-2 rounded-md border p-3"
              data-testid={`speaker-${l.label}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-medium">{l.display}</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {t("duration", { value: formatDuration(l.duration_sec) })}
                </span>
              </div>

              <ul className="space-y-1 text-sm">
                {l.samples.map((s, i) => (
                  <li key={i} className="italic">
                    <span className="mr-2 text-xs not-italic text-[var(--color-muted-foreground)]">
                      {formatMs(s.start_ms)}
                    </span>
                    «{s.text}»
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-start gap-2">
                <select
                  aria-label={t("assignLabel", { speaker: l.display })}
                  data-testid={`speaker-select-${l.label}`}
                  className="h-10 rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm"
                  value={selectValue(choice)}
                  disabled={busy}
                  onChange={(e) => onSelect(l.label, e.target.value)}
                >
                  <option value={KEEP}>{t("option.keep")}</option>
                  {data.participants.length > 0 && (
                    <optgroup label={t("option.participants")}>
                      {data.participants.map((p) => (
                        <option key={p.id} value={PARTICIPANT + p.id}>
                          {p.role ? `${p.name} — ${p.role}` : p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value={OTHER}>{t("option.other")}</option>
                  {index > 0 && (
                    <optgroup label={t("option.same")}>
                      {data.labels.slice(0, index).map((other) => (
                        <option key={other.label} value={MERGE + other.label}>
                          {t("option.sameAs", { speaker: other.display })}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {choice.kind === "name" && (
                  <Input
                    aria-label={t("nameLabel", { speaker: l.display })}
                    aria-invalid={showError}
                    data-testid={`speaker-name-${l.label}`}
                    placeholder={t("namePlaceholder")}
                    className="w-64"
                    value={choice.name}
                    disabled={busy}
                    onChange={(e) =>
                      setChoice(l.label, { kind: "name", name: e.target.value })
                    }
                  />
                )}
              </div>

              {showError && (
                <p
                  role="alert"
                  className="text-xs text-red-600"
                  data-testid={`speaker-name-error-${l.label}`}
                >
                  {t("error.nameRequired")}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p
          role="alert"
          className="text-sm text-red-600"
          data-testid="speakers-error"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => void submit("confirm")}
          data-testid="speakers-confirm"
        >
          {busy ? t("submitting") : t("confirm")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void submit("skip")}
          data-testid="speakers-skip"
        >
          {t("skip")}
        </Button>
      </div>
    </section>
  );
}
