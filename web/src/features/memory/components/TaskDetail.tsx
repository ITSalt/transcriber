import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTaskDetail } from "../api";
import { formatTimecode, QueryState } from "./QueryState";
import { TaskEditForm, type ParticipantOption } from "./TaskEditForm";

interface TaskDetailProps {
  projectId: string;
  code: string;
  participants: ParticipantOption[];
  onClose: () => void;
}

/** Task history: where it was created, mentions with quotes, change log, manual edit. */
export function TaskDetail({ projectId, code, participants, onClose }: TaskDetailProps) {
  const { t } = useTranslation("memory");
  const { data, isLoading, error } = useTaskDetail(projectId, code);
  // Lives here, above the form: the form is re-keyed when a refetch brings a new updated_at.
  const [saved, setSaved] = useState(false);

  return (
    <section data-testid="task-detail" aria-label={t("detail.title", { code })} className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("detail.title", { code })}</h3>
        <Button variant="outline" size="sm" onClick={onClose} data-testid="task-detail-close">
          {t("detail.close")}
        </Button>
      </div>
      <QueryState isLoading={isLoading} error={error}>
        {data && (
          <>
            <div>
              <p className="font-medium">{data.task.title}</p>
              {data.task.description && <p className="text-sm">{data.task.description}</p>}
              <p className="text-sm" data-testid="task-created-in">
                {t("detail.createdIn")}:{" "}
                {data.task.created_in_meeting_id ? (
                  <Link className="underline" to={`/meetings/${data.task.created_in_meeting_id}`}>
                    {data.mentions.find((m) => m.kind === "CREATED")?.meeting_title ??
                      data.task.created_in_meeting_id}
                  </Link>
                ) : (
                  t("detail.unknownMeeting")
                )}
              </p>
            </div>

            <div>
              <h4 className="font-medium">{t("detail.mentions")}</h4>
              {data.mentions.length === 0 ? (
                <p className="text-sm">{t("detail.noMentions")}</p>
              ) : (
                <ul className="flex flex-col gap-2" data-testid="task-mentions">
                  {data.mentions.map((m, i) => (
                    <li key={`${m.meeting_id}-${i}`} className="text-sm">
                      <Link className="underline" to={`/meetings/${m.meeting_id}`}>
                        {m.meeting_title}
                      </Link>
                      {m.speaker_label && <span> · {m.speaker_label}</span>}
                      <blockquote className="border-l-2 pl-2 italic">{m.quote}</blockquote>
                      {m.start_ms !== null && (
                        <Link
                          className="underline"
                          to={`/meetings/${m.meeting_id}/transcript?t=${m.start_ms}`}
                          data-testid="mention-timecode"
                        >
                          {t("detail.openAt", { time: formatTimecode(m.start_ms) })}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="font-medium">{t("detail.events")}</h4>
              {data.events.length === 0 ? (
                <p className="text-sm">{t("detail.noEvents")}</p>
              ) : (
                <ol className="flex flex-col gap-2" data-testid="task-events">
                  {data.events.map((ev) => (
                    <li key={ev.id} className="text-sm">
                      <span className="font-medium">{t(`field.${ev.field}`)}</span>:{" "}
                      {ev.old_value ?? t("detail.empty")} → {ev.new_value ?? t("detail.empty")}{" "}
                      <Badge variant="outline">{t(`detail.source.${ev.source}`)}</Badge>{" "}
                      <Badge variant="secondary">{t(`detail.reviewState.${ev.review_state}`)}</Badge>{" "}
                      <time dateTime={ev.valid_at}>{new Date(ev.valid_at).toLocaleString()}</time>
                      {ev.quote && <blockquote className="border-l-2 pl-2 italic">{ev.quote}</blockquote>}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <TaskEditForm
              key={`${data.task.code}-${data.task.updated_at}`}
              projectId={projectId}
              task={data.task}
              participants={participants}
              saved={saved}
              onSaved={() => setSaved(true)}
              onEdit={() => setSaved(false)}
            />
          </>
        )}
      </QueryState>
    </section>
  );
}
