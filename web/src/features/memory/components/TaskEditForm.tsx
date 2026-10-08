import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  canTransitionTaskStatus,
  MemoryTaskStatus,
  type MemoryTask,
  type TaskPatchRequest,
} from "@transcrib/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePatchTask } from "../api";

const STATUSES = MemoryTaskStatus.options;
const KEEP = "__keep__";
const NONE = "";

export interface ParticipantOption {
  id: string;
  name: string;
}

interface TaskEditFormProps {
  projectId: string;
  task: MemoryTask;
  participants: ParticipantOption[];
  /** Owned by the parent: the form is re-keyed (remounted) after a refetch. */
  saved: boolean;
  onSaved: () => void;
  onEdit: () => void;
}

/** Manual edit of status / assignee / due date → PATCH (event source USER). */
export function TaskEditForm({
  projectId,
  task,
  participants,
  saved,
  onSaved,
  onEdit,
}: TaskEditFormProps) {
  const { t } = useTranslation("memory");
  // onSaved is a hook-level callback: it still fires if the refetch remounts this form.
  const patch = usePatchTask(projectId, task.code, onSaved);

  const currentAssignee = task.assignee?.participant_id ?? (task.assignee ? KEEP : NONE);
  const [status, setStatus] = useState<MemoryTaskStatus>(task.status);
  const [assignee, setAssignee] = useState<string>(currentAssignee);
  const [due, setDue] = useState<string>(task.due_date ?? "");

  const statusOptions = STATUSES.filter(
    (s) => s === task.status || canTransitionTaskStatus(task.status, s),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: TaskPatchRequest = {};
    if (status !== task.status) body.status = status;
    if (assignee !== currentAssignee && assignee !== KEEP) {
      body.assignee_participant_id = assignee === NONE ? null : assignee;
    }
    if (due !== (task.due_date ?? "")) body.due_date = due === "" ? null : due;
    if (Object.keys(body).length === 0) return;
    onEdit();
    patch.mutate(body);
  };

  return (
    <form onSubmit={submit} data-testid="task-edit-form" className="flex flex-col gap-3">
      <h4 className="font-medium">{t("edit.title")}</h4>
      <label className="flex flex-col gap-1 text-sm">
        {t("edit.status")}
        <select
          aria-label={t("edit.status")}
          data-testid="task-edit-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as MemoryTaskStatus)}
          className="h-9 rounded-md border px-2"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("edit.assignee")}
        <select
          aria-label={t("edit.assignee")}
          data-testid="task-edit-assignee"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="h-9 rounded-md border px-2"
        >
          {currentAssignee === KEEP && task.assignee && (
            <option value={KEEP}>{task.assignee.name}</option>
          )}
          <option value={NONE}>{t("tasks.unassigned")}</option>
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("edit.dueDate")}
        <Input
          type="date"
          aria-label={t("edit.dueDate")}
          data-testid="task-edit-due"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" data-testid="task-edit-save" disabled={patch.isPending}>
          {t("edit.save")}
        </Button>
        {saved && <span role="status">{t("edit.saved")}</span>}
        {patch.isError && (
          <span role="alert" data-testid="task-edit-error">
            {t("edit.error", { message: patch.error.message })}
          </span>
        )}
      </div>
    </form>
  );
}
