import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPostEmpty } from "@/lib/api";
import {
  DecisionListResponse,
  MeetingMemoryRefsResponse,
  ProjectMemoryResponse,
  ReviewDecisionResponse,
  ReviewQueueResponse,
  TaskDetailResponse,
  TaskListResponse,
  type MemoryTaskStatus,
  type TaskPatchRequest,
} from "@transcrib/shared";

export interface TaskFilters {
  status?: MemoryTaskStatus;
  assignee?: string;
}

const base = (projectId: string) => `/api/projects/${projectId}`;

export const memoryKeys = {
  tasks: (projectId: string, f: TaskFilters) =>
    ["memory", projectId, "tasks", f.status ?? "", f.assignee ?? ""] as const,
  task: (projectId: string, code: string) =>
    ["memory", projectId, "task", code] as const,
  decisions: (projectId: string) => ["memory", projectId, "decisions"] as const,
  summary: (projectId: string) => ["memory", projectId, "summary"] as const,
  review: (projectId: string) => ["memory", projectId, "review"] as const,
  refs: (meetingId: string) => ["memory", "refs", meetingId] as const,
};

export function useTasks(projectId: string, filters: TaskFilters) {
  const qs = new URLSearchParams();
  if (filters.status) qs.set("status", filters.status);
  if (filters.assignee) qs.set("assignee", filters.assignee);
  const query = qs.toString();
  return useQuery({
    queryKey: memoryKeys.tasks(projectId, filters),
    queryFn: () =>
      apiGet(
        `${base(projectId)}/tasks${query ? `?${query}` : ""}`,
        TaskListResponse,
      ),
  });
}

export function useTaskDetail(projectId: string, code: string | null) {
  return useQuery({
    queryKey: memoryKeys.task(projectId, code ?? ""),
    queryFn: () =>
      apiGet(`${base(projectId)}/tasks/${code}`, TaskDetailResponse),
    enabled: code !== null,
  });
}

export function useDecisions(projectId: string) {
  return useQuery({
    queryKey: memoryKeys.decisions(projectId),
    queryFn: () => apiGet(`${base(projectId)}/decisions`, DecisionListResponse),
  });
}

export function useProjectMemory(projectId: string) {
  return useQuery({
    queryKey: memoryKeys.summary(projectId),
    queryFn: () => apiGet(`${base(projectId)}/memory`, ProjectMemoryResponse),
  });
}

export function useReviewQueue(projectId: string) {
  return useQuery({
    queryKey: memoryKeys.review(projectId),
    queryFn: () =>
      apiGet(`${base(projectId)}/review-queue`, ReviewQueueResponse),
  });
}

export function useMeetingMemoryRefs(meetingId: string) {
  return useQuery({
    queryKey: memoryKeys.refs(meetingId),
    queryFn: () =>
      apiGet(
        `/api/meetings/${meetingId}/memory-refs`,
        MeetingMemoryRefsResponse,
      ),
    enabled: Boolean(meetingId),
  });
}

export function usePatchTask(
  projectId: string,
  code: string,
  onSaved?: () => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TaskPatchRequest) =>
      apiPatch(`${base(projectId)}/tasks/${code}`, body, TaskDetailResponse),
    onSuccess: () => onSaved?.(),
    // onSettled: a 409/404 means the server state moved on — refetch either way.
    onSettled: () => qc.invalidateQueries({ queryKey: ["memory", projectId] }),
  });
}

export function useReviewEvent(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      action,
    }: {
      eventId: string;
      action: "confirm" | "reject";
    }) =>
      apiPostEmpty(
        `/api/task-events/${eventId}/${action}`,
        ReviewDecisionResponse,
      ),
    // onSettled: a 409/404 means the server state moved on — refetch either way.
    onSettled: () => qc.invalidateQueries({ queryKey: ["memory", projectId] }),
  });
}
