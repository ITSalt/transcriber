import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ProjectListResponse,
  ProjectDetailResponse,
  ProjectParticipant,
  GlossaryTerm,
  LastProtocolResponse,
  type ParticipantInput,
  type GlossaryTermInput,
  type ParticipantUpdate,
  type GlossaryTermUpdate,
  type ProjectCreateRequest,
  type ProjectUpdateRequest,
} from "@transcrib/shared";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { currentWorkspaceId } from "./workspace";

export const projectKeys = {
  list: (workspaceId: string) => ["projects", "list", workspaceId] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
  lastProtocol: (id: string) => ["projects", "last-protocol", id] as const,
};

export function useProjects() {
  const workspaceId = currentWorkspaceId();
  return useQuery({
    queryKey: projectKeys.list(workspaceId),
    queryFn: () =>
      apiGet(`/api/projects?workspace_id=${workspaceId}`, ProjectListResponse),
  });
}

export function useProject(projectId: string | null | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(projectId ?? ""),
    queryFn: () => apiGet(`/api/projects/${projectId}`, ProjectDetailResponse),
    enabled: !!projectId,
  });
}

/** null when the project has no protocol yet (404 PREVIOUS_PROTOCOL_UNAVAILABLE). */
export function useLastProtocol(projectId: string | null | undefined) {
  return useQuery({
    queryKey: projectKeys.lastProtocol(projectId ?? ""),
    queryFn: async () => {
      try {
        return await apiGet(
          `/api/projects/${projectId}/last-protocol`,
          LastProtocolResponse,
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!projectId,
  });
}

function useInvalidateProjects() {
  const client = useQueryClient();
  return (projectId?: string) => {
    void client.invalidateQueries({ queryKey: ["projects", "list"] });
    if (projectId) {
      void client.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    }
  };
}

export function useCreateProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (input: { name: string; description?: string | null }) => {
      const body: ProjectCreateRequest = {
        workspace_id: currentWorkspaceId(),
        name: input.name,
        description: input.description ?? null,
      };
      return apiPost("/api/projects", body, ProjectDetailResponse);
    },
    onSuccess: (res) => invalidate(res.project.id),
  });
}

export function useUpdateProject(projectId: string) {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (body: ProjectUpdateRequest) =>
      apiPatch(`/api/projects/${projectId}`, body, ProjectDetailResponse),
    onSuccess: () => invalidate(projectId),
  });
}

export function useDeleteProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (projectId: string) => apiDelete(`/api/projects/${projectId}`),
    onSuccess: () => invalidate(),
  });
}

export function useAddParticipant(projectId: string) {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (body: ParticipantInput) =>
      apiPost(`/api/projects/${projectId}/participants`, body, ProjectParticipant),
    onSuccess: () => invalidate(projectId),
  });
}

export function useUpdateParticipant(projectId: string) {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (v: { id: string; body: ParticipantUpdate }) =>
      apiPatch(
        `/api/projects/${projectId}/participants/${v.id}`,
        v.body,
        ProjectParticipant,
      ),
    onSuccess: () => invalidate(projectId),
  });
}

export function useDeleteParticipant(projectId: string) {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete(`/api/projects/${projectId}/participants/${id}`),
    onSuccess: () => invalidate(projectId),
  });
}

export function useAddGlossaryTerm(projectId: string) {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (body: GlossaryTermInput) =>
      apiPost(`/api/projects/${projectId}/glossary`, body, GlossaryTerm),
    onSuccess: () => invalidate(projectId),
  });
}

export function useUpdateGlossaryTerm(projectId: string) {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (v: { id: string; body: GlossaryTermUpdate }) =>
      apiPatch(
        `/api/projects/${projectId}/glossary/${v.id}`,
        v.body,
        GlossaryTerm,
      ),
    onSuccess: () => invalidate(projectId),
  });
}

export function useDeleteGlossaryTerm(projectId: string) {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete(`/api/projects/${projectId}/glossary/${id}`),
    onSuccess: () => invalidate(projectId),
  });
}

/** "a, b ,c" → ["a","b","c"] (variants / aliases input). */
export function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
