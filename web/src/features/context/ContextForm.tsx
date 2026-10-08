import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MeetingType } from "@transcrib/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddGlossaryTerm,
  useAddParticipant,
  useLastProtocol,
  useProject,
  useProjects,
} from "@/features/projects/api";
import {
  ParticipantForm,
  TermForm,
  type ParticipantValue,
  type TermValue,
} from "@/features/projects/forms";
import {
  ASR_KEYTERMS_MAX,
  countRecognitionTerms,
  isProtocolTooLong,
  type ContextDraft,
  type PreviousMode,
} from "./draft";

const NATIVE_SELECT_CLASS =
  "flex h-10 w-full rounded-sm border border-[var(--color-input)] bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50";

function Label({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
      {children}
    </label>
  );
}

/** «Добавить в проект» for one meeting addition; explicit action, never automatic. */
function AddToProjectButton({
  projectId,
  onAdd,
  onAdded,
  testId,
}: {
  projectId: string;
  onAdd: () => Promise<unknown>;
  onAdded: () => void;
  testId: string;
}) {
  const { t } = useTranslation("context");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        data-testid={testId}
        data-project-id={projectId}
        onClick={() => {
          setBusy(true);
          setFailed(false);
          onAdd()
            .then(onAdded)
            .catch(() => setFailed(true))
            .finally(() => setBusy(false));
        }}
      >
        {t("addToProject")}
      </Button>
      {failed && (
        <span role="alert" className="text-xs text-red-600">
          {t("addToProjectError")}
        </span>
      )}
    </>
  );
}

export function ContextForm({
  draft,
  onChange,
  disabled,
}: {
  draft: ContextDraft;
  onChange: (next: ContextDraft) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("context");
  const { t: tp } = useTranslation("projects");
  const projects = useProjects();
  const project = useProject(draft.projectId);
  const lastProtocol = useLastProtocol(draft.projectId);
  const addParticipant = useAddParticipant(draft.projectId ?? "");
  const addTerm = useAddGlossaryTerm(draft.projectId ?? "");
  const [fileError, setFileError] = useState<string | null>(null);

  const set = (patch: Partial<ContextDraft>) => onChange({ ...draft, ...patch });
  const detail = project.data;
  const recognitionCount = countRecognitionTerms(detail, draft);
  const overLimit = recognitionCount > ASR_KEYTERMS_MAX;

  async function handleProtocolFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    if (isProtocolTooLong(text)) {
      setFileError(t("previous.tooLong"));
      return;
    }
    setFileError(null);
    set({ previousMode: "paste", previousText: text });
  }

  function removeParticipant(index: number) {
    set({ participants: draft.participants.filter((_, i) => i !== index) });
  }
  function removeTerm(index: number) {
    set({ glossary: draft.glossary.filter((_, i) => i !== index) });
  }

  return (
    <fieldset
      className="mb-6 grid gap-5 rounded-lg border p-4"
      disabled={disabled}
      data-testid="context-form"
    >
      <legend className="px-2 text-base font-semibold">{t("title")}</legend>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      {/* Project (optional) */}
      <div>
        <Label htmlFor="context-project">{t("project.label")}</Label>
        <select
          id="context-project"
          className={NATIVE_SELECT_CLASS}
          value={draft.projectId ?? ""}
          onChange={(e) => set({ projectId: e.target.value || null })}
          data-testid="context-project"
        >
          <option value="">{t("project.none")}</option>
          {projects.data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Read-only project context */}
      {draft.projectId && detail && (
        <div className="grid gap-3" data-testid="context-project-info">
          <div>
            <h3 className="mb-1 text-sm font-semibold">
              {t("project.participants")}{" "}
              <Badge variant="outline">{t("fromProject")}</Badge>
            </h3>
            {detail.participants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {tp("participants.empty")}
              </p>
            ) : (
              <ul className="grid gap-1 text-sm" data-testid="context-project-participants">
                {detail.participants.map((p) => (
                  <li key={p.id} data-testid={`context-project-participant-${p.id}`}>
                    <span className="font-medium">{p.name}</span>
                    {p.role ? ` · ${p.role}` : ""}
                    {p.organization ? ` · ${p.organization}` : ""}
                    {` · ${tp(`side.${p.side}`)}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">
              {t("project.glossary")}{" "}
              <Badge variant="outline">{t("fromProject")}</Badge>
            </h3>
            {detail.glossary.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {tp("glossary.empty")}
              </p>
            ) : (
              <ul className="grid gap-1 text-sm" data-testid="context-project-glossary">
                {detail.glossary.map((g) => (
                  <li key={g.id} data-testid={`context-project-term-${g.id}`}>
                    <span className="font-medium">{g.term}</span>
                    {g.variants.length > 0 ? ` (${g.variants.join(", ")})` : ""}
                    {g.definition ? ` — ${g.definition}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Meeting additions */}
      <div className="grid gap-4" data-testid="context-additions">
        <h3 className="text-sm font-semibold">{t("additions.title")}</h3>

        <div>
          <Label htmlFor="context-type">{t("type.label")}</Label>
          <select
            id="context-type"
            className={NATIVE_SELECT_CLASS}
            value={draft.meetingType ?? ""}
            onChange={(e) =>
              set({
                meetingType: e.target.value
                  ? MeetingType.parse(e.target.value)
                  : null,
              })
            }
            data-testid="context-type"
          >
            <option value="">{t("type.none")}</option>
            {MeetingType.options.map((m) => (
              <option key={m} value={m}>
                {t(`type.${m}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="context-goal">{t("goal")}</Label>
          <Input
            id="context-goal"
            value={draft.goal}
            onChange={(e) => set({ goal: e.target.value })}
            data-testid="context-goal"
          />
        </div>

        <div>
          <Label htmlFor="context-agenda">{t("agenda")}</Label>
          <Textarea
            id="context-agenda"
            value={draft.agenda}
            onChange={(e) => set({ agenda: e.target.value })}
            data-testid="context-agenda"
          />
        </div>

        {/* Additional participants */}
        <div>
          <h4 className="mb-2 text-sm font-medium">{t("extraParticipants")}</h4>
          {draft.participants.length > 0 && (
            <ul className="mb-2 grid gap-2" data-testid="context-extra-participants">
              {draft.participants.map((p: ParticipantValue, i) => (
                <li
                  key={`${p.name}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-sm border p-2 text-sm"
                  data-testid={`context-extra-participant-${i}`}
                >
                  <span>
                    <span className="font-medium">{p.name}</span>
                    {p.role ? ` · ${p.role}` : ""}
                    {p.organization ? ` · ${p.organization}` : ""}
                    {` · ${tp(`side.${p.side}`)}`}
                  </span>
                  <span className="flex items-center gap-2">
                    {draft.projectId && (
                      <AddToProjectButton
                        projectId={draft.projectId}
                        testId={`context-extra-participant-${i}-to-project`}
                        onAdd={() => addParticipant.mutateAsync(p)}
                        onAdded={() => removeParticipant(i)}
                      />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeParticipant(i)}
                      aria-label={tp("remove")}
                    >
                      ✕
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ParticipantForm
            testId="context-participant-form"
            submitLabel={t("addToMeeting")}
            onSubmit={(v) => set({ participants: [...draft.participants, v] })}
          />
        </div>

        {/* Additional terms */}
        <div>
          <h4 className="mb-2 text-sm font-medium">{t("extraTerms")}</h4>
          {draft.glossary.length > 0 && (
            <ul className="mb-2 grid gap-2" data-testid="context-extra-terms">
              {draft.glossary.map((g: TermValue, i) => (
                <li
                  key={`${g.term}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-sm border p-2 text-sm"
                  data-testid={`context-extra-term-${i}`}
                >
                  <span>
                    <span className="font-medium">{g.term}</span>
                    {g.variants.length > 0 ? ` (${g.variants.join(", ")})` : ""}
                    {g.definition ? ` — ${g.definition}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    {draft.projectId && (
                      <AddToProjectButton
                        projectId={draft.projectId}
                        testId={`context-extra-term-${i}-to-project`}
                        onAdd={() => addTerm.mutateAsync(g)}
                        onAdded={() => removeTerm(i)}
                      />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTerm(i)}
                      aria-label={tp("remove")}
                    >
                      ✕
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <TermForm
            testId="context-term-form"
            submitLabel={t("addToMeeting")}
            onSubmit={(v) => set({ glossary: [...draft.glossary, v] })}
          />
        </div>

        {/* Recognition budget hint */}
        <p
          className={
            overLimit
              ? "text-sm font-medium text-red-600"
              : "text-xs text-muted-foreground"
          }
          data-testid="context-limit-hint"
          data-over-limit={overLimit}
        >
          {t("limitHint", { max: ASR_KEYTERMS_MAX })}
          {overLimit && ` ${t("limitExceeded", { count: recognitionCount })}`}
        </p>

        {/* Previous protocol */}
        <div data-testid="context-previous">
          <Label htmlFor="context-previous-mode">{t("previous.label")}</Label>
          <select
            id="context-previous-mode"
            className={NATIVE_SELECT_CLASS}
            value={draft.previousMode}
            onChange={(e) =>
              set({ previousMode: e.target.value as PreviousMode })
            }
            data-testid="context-previous-mode"
          >
            <option value="project">{t("previous.project")}</option>
            <option value="paste">{t("previous.paste")}</option>
            <option value="none">{t("previous.none")}</option>
          </select>
          {draft.previousMode === "project" && (
            <p
              className="mt-1 text-xs text-muted-foreground"
              data-testid="context-previous-project-info"
            >
              {!draft.projectId
                ? t("previous.needProject")
                : lastProtocol.data
                  ? t("previous.fromMeeting", {
                      title: lastProtocol.data.meeting_title,
                      version: lastProtocol.data.version_n,
                    })
                  : lastProtocol.isLoading
                    ? tp("loading")
                    : t("previous.unavailable")}
            </p>
          )}
          {draft.previousMode === "paste" && (
            <div className="mt-2 grid gap-2">
              <Textarea
                value={draft.previousText}
                onChange={(e) => set({ previousText: e.target.value })}
                placeholder={t("previous.pastePlaceholder")}
                aria-label={t("previous.paste")}
                data-testid="context-previous-text"
              />
              <Input
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                onChange={(e) => void handleProtocolFile(e)}
                aria-label={t("previous.file")}
                data-testid="context-previous-file"
              />
              {fileError && (
                <p role="alert" className="text-xs text-red-600">
                  {fileError}
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="context-notes">{t("notes")}</Label>
          <Textarea
            id="context-notes"
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
            data-testid="context-notes"
          />
        </div>
      </div>
    </fieldset>
  );
}
