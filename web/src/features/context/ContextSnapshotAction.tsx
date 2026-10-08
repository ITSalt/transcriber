import { useTranslation } from "react-i18next";
import type { SlotContext } from "@/lib/features";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useMeetingContext } from "./api";

/** meeting.actions slot: opens the context the recognition used (frozen snapshot). */
export function ContextSnapshotAction({ meetingId }: SlotContext) {
  const { t } = useTranslation("context");
  const { t: tp } = useTranslation("projects");
  const { data } = useMeetingContext(meetingId);

  // Meetings started without a context have none: show nothing.
  if (!data) return null;

  const empty =
    !data.meeting_type &&
    !data.goal &&
    !data.agenda &&
    !data.notes &&
    data.participants.length === 0 &&
    data.glossary.length === 0 &&
    data.previous_protocol.source === "none";
  if (empty && !data.project_id) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="context-snapshot-open">
          {t("snapshot.open")}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        data-testid="context-snapshot"
      >
        <DialogHeader>
          <DialogTitle>{t("snapshot.title")}</DialogTitle>
          <DialogDescription>
            {data.frozen ? t("snapshot.frozen") : t("snapshot.draft")}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-3 text-sm">
          {data.meeting_type && (
            <div>
              <dt className="font-semibold">{t("type.label")}</dt>
              <dd>{t(`type.${data.meeting_type}`)}</dd>
            </div>
          )}
          {data.goal && (
            <div>
              <dt className="font-semibold">{t("goal")}</dt>
              <dd>{data.goal}</dd>
            </div>
          )}
          {data.agenda && (
            <div>
              <dt className="font-semibold">{t("agenda")}</dt>
              <dd className="whitespace-pre-wrap">{data.agenda}</dd>
            </div>
          )}
          {data.participants.length > 0 && (
            <div data-testid="context-snapshot-participants">
              <dt className="font-semibold">{t("snapshot.participants")}</dt>
              <dd>
                <ul className="grid gap-1">
                  {data.participants.map((p, i) => (
                    <li key={`${p.name}-${i}`}>
                      <span className="font-medium">{p.name}</span>
                      {p.role ? ` · ${p.role}` : ""}
                      {p.organization ? ` · ${p.organization}` : ""}
                      {` · ${tp(`side.${p.side}`)} `}
                      <Badge variant="outline">
                        {p.source === "project"
                          ? t("fromProject")
                          : t("fromMeeting")}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {data.glossary.length > 0 && (
            <div data-testid="context-snapshot-glossary">
              <dt className="font-semibold">{t("snapshot.glossary")}</dt>
              <dd>
                <ul className="grid gap-1">
                  {data.glossary.map((g, i) => (
                    <li key={`${g.term}-${i}`}>
                      <span className="font-medium">{g.term}</span>
                      {g.variants.length > 0 ? ` (${g.variants.join(", ")})` : ""}
                      {g.definition ? ` — ${g.definition} ` : " "}
                      <Badge variant="outline">
                        {g.source === "project"
                          ? t("fromProject")
                          : t("fromMeeting")}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {data.previous_protocol.source !== "none" && (
            <div data-testid="context-snapshot-previous">
              <dt className="font-semibold">{t("previous.label")}</dt>
              <dd className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-sm border p-2">
                {data.previous_protocol.text ?? t("previous.unavailable")}
              </dd>
            </div>
          )}
          {data.notes && (
            <div>
              <dt className="font-semibold">{t("notes")}</dt>
              <dd className="whitespace-pre-wrap">{data.notes}</dd>
            </div>
          )}
        </dl>
        {data.snapshot_hash && (
          <p className="font-mono text-xs text-muted-foreground">
            {t("snapshot.hash")}: {data.snapshot_hash.slice(0, 12)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
