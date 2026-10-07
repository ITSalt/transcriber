import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { SlotContext } from "@/lib/features";
import { useReviewQueue } from "../api";
import { DecisionsTab } from "./DecisionsTab";
import { ReviewQueueTab } from "./ReviewQueueTab";
import { SummaryTab } from "./SummaryTab";
import { TasksTab } from "./TasksTab";

const TABS = ["tasks", "decisions", "summary", "review"] as const;
type Tab = (typeof TABS)[number];

function isTab(v: string | null): v is Tab {
  return TABS.includes(v as Tab);
}

/**
 * `project.tabs` slot: the memory sections of a project card.
 * The tab and the open task live in the URL (`?mem=review&task=T-3`), so the
 * protocol page can deep-link here. The review counter sits on the tab itself.
 */
export function ProjectMemoryTabs({ projectId }: SlotContext) {
  const { t } = useTranslation("memory");
  const [params, setParams] = useSearchParams();
  if (!projectId) return null;

  const raw = params.get("mem");
  const tab: Tab = isTab(raw) ? raw : "tasks";
  const selectedCode = params.get("task");

  const update = (mutate: (p: URLSearchParams) => void) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        return next;
      },
      { replace: true },
    );

  return (
    <section aria-label={t("tabs.label")} data-testid="memory-tabs" className="flex flex-col gap-4">
      <MemoryTabList
        projectId={projectId}
        active={tab}
        onChange={(next) => update((p) => p.set("mem", next))}
      />
      <div role="tabpanel" data-testid={`memory-panel-${tab}`}>
        {tab === "tasks" && (
          <TasksTab
            projectId={projectId}
            selectedCode={selectedCode}
            onSelect={(code) =>
              update((p) => (code ? p.set("task", code) : p.delete("task")))
            }
          />
        )}
        {tab === "decisions" && <DecisionsTab projectId={projectId} />}
        {tab === "summary" && <SummaryTab projectId={projectId} />}
        {tab === "review" && <ReviewQueueTab projectId={projectId} />}
      </div>
    </section>
  );
}

function MemoryTabList({
  projectId,
  active,
  onChange,
}: {
  projectId: string;
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  const { t } = useTranslation("memory");
  const queue = useReviewQueue(projectId);
  const count = queue.data?.count ?? 0;

  return (
    <div role="tablist" aria-label={t("tabs.label")} className="flex gap-2 border-b">
      {TABS.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={id === active}
          data-testid={`memory-tab-${id}`}
          onClick={() => onChange(id)}
          className={`px-3 py-2 ${id === active ? "border-b-2 font-semibold" : ""}`}
        >
          {t(`tabs.${id}`)}
          {id === "review" && count > 0 && (
            <Badge variant="destructive" className="ml-2" data-testid="review-counter">
              {count}
            </Badge>
          )}
        </button>
      ))}
    </div>
  );
}
