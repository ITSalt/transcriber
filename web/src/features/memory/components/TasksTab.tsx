import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MemoryTaskStatus } from "@transcrib/shared";
import { Badge } from "@/components/ui/badge";
import { useTasks, type TaskFilters } from "../api";
import { QueryState } from "./QueryState";
import { TaskDetail } from "./TaskDetail";
import type { ParticipantOption } from "./TaskEditForm";

interface TasksTabProps {
  projectId: string;
  selectedCode: string | null;
  onSelect: (code: string | null) => void;
}

export function TasksTab({ projectId, selectedCode, onSelect }: TasksTabProps) {
  const { t } = useTranslation("memory");
  const [status, setStatus] = useState<TaskFilters["status"]>(undefined);
  const [assignee, setAssignee] = useState<string>("");

  const filters: TaskFilters = {
    ...(status ? { status } : {}),
    ...(assignee ? { assignee } : {}),
  };
  const filtered = useTasks(projectId, filters);
  // Unfiltered list feeds the assignee options so they do not vanish while filtering.
  const all = useTasks(projectId, {});

  const people = useMemo(() => {
    const byName = new Map<string, { id: string | null; name: string }>();
    for (const task of all.data?.items ?? []) {
      const a = task.assignee;
      if (a && !byName.has(a.name)) byName.set(a.name, { id: a.participant_id, name: a.name });
    }
    return [...byName.values()];
  }, [all.data]);
  const participants = people.filter((p): p is ParticipantOption => p.id !== null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {t("tasks.filterStatus")}
          <select
            aria-label={t("tasks.filterStatus")}
            data-testid="filter-status"
            value={status ?? ""}
            onChange={(e) =>
              setStatus(e.target.value ? MemoryTaskStatus.parse(e.target.value) : undefined)
            }
            className="h-9 rounded-md border px-2"
          >
            <option value="">{t("tasks.allStatuses")}</option>
            {MemoryTaskStatus.options.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("tasks.filterAssignee")}
          <select
            aria-label={t("tasks.filterAssignee")}
            data-testid="filter-assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="h-9 rounded-md border px-2"
          >
            <option value="">{t("tasks.allAssignees")}</option>
            {people.map((p) => (
              <option key={p.name} value={p.id ?? p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <QueryState isLoading={filtered.isLoading} error={filtered.error}>
        {filtered.data && filtered.data.items.length === 0 ? (
          <p data-testid="tasks-empty">{t("tasks.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="tasks-list">
            {filtered.data?.items.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onSelect(task.code === selectedCode ? null : task.code)}
                  aria-pressed={task.code === selectedCode}
                  data-testid={`task-row-${task.code}`}
                  className="flex w-full flex-wrap items-center gap-2 rounded-md border p-3 text-left"
                >
                  <span className="font-mono">{task.code}</span>
                  <span className="font-medium">{task.title}</span>
                  <Badge variant="secondary">{t(`status.${task.status}`)}</Badge>
                  <span className="text-sm">{task.assignee?.name ?? t("tasks.unassigned")}</span>
                  {task.due_date && (
                    <span className="text-sm">{t("tasks.due", { date: task.due_date })}</span>
                  )}
                  {task.merged_into && (
                    <span className="text-sm">{t("tasks.mergedInto", { code: task.merged_into })}</span>
                  )}
                  {task.pending_count > 0 && (
                    <Badge variant="destructive">{t("tasks.pending", { count: task.pending_count })}</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      {selectedCode && (
        <TaskDetail
          projectId={projectId}
          code={selectedCode}
          participants={participants}
          onClose={() => onSelect(null)}
        />
      )}
    </div>
  );
}
