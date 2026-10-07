import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { SlotContext } from "@/lib/features";
import { useMeetingMemoryRefs } from "../api";

/** `protocol.toolbar` slot: links to the T-n / D-n mentioned in this meeting. */
export function MeetingMemoryRefs({ meetingId }: SlotContext) {
  const { t } = useTranslation("memory");
  const { data } = useMeetingMemoryRefs(meetingId ?? "");

  // Memory is optional: no project, nothing mentioned, or Neo4j down → render nothing.
  if (!data?.project_id) return null;
  if (data.tasks.length === 0 && data.decisions.length === 0) return null;
  const projectId = data.project_id;

  return (
    <nav aria-label={t("refs.title")} data-testid="memory-refs" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{t("refs.title")}:</span>
      {data.tasks.map((task) => (
        <Link
          key={task.code}
          to={`/projects/${projectId}?mem=tasks&task=${task.code}`}
          title={task.title}
          data-testid={`ref-${task.code}`}
          className="font-mono underline"
        >
          {task.code}
        </Link>
      ))}
      {data.decisions.map((d) => (
        <Link
          key={d.code}
          to={`/projects/${projectId}?mem=decisions`}
          title={d.text}
          data-testid={`ref-${d.code}`}
          className="font-mono underline"
        >
          {d.code}
        </Link>
      ))}
    </nav>
  );
}
