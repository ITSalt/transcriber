import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FeedbackCreateResponse,
  FeedbackListResponse,
  ProtocolVersionListResponse,
  ProtocolVersionResponse,
  type FeedbackFields,
} from "@transcrib/shared";
import { ApiError, apiGet } from "@/lib/api";

export const feedbackKey = (meetingId: string) => ["feedback", meetingId] as const;
export const versionsKey = (meetingId: string) =>
  ["protocol-versions", meetingId] as const;

export function useFeedbackList(meetingId: string, enabled: boolean) {
  return useQuery({
    queryKey: feedbackKey(meetingId),
    queryFn: () =>
      apiGet(`/api/meetings/${meetingId}/feedback`, FeedbackListResponse),
    enabled: enabled && Boolean(meetingId),
  });
}

export function useProtocolVersions(meetingId: string, enabled: boolean) {
  return useQuery({
    queryKey: versionsKey(meetingId),
    queryFn: () =>
      apiGet(
        `/api/meetings/${meetingId}/protocol/versions`,
        ProtocolVersionListResponse,
      ),
    enabled: enabled && Boolean(meetingId),
  });
}

export function useProtocolVersion(meetingId: string, n: number | null) {
  return useQuery({
    queryKey: [...versionsKey(meetingId), n] as const,
    queryFn: () =>
      apiGet(
        `/api/meetings/${meetingId}/protocol/versions/${n}`,
        ProtocolVersionResponse,
      ),
    enabled: Boolean(meetingId) && n !== null,
  });
}

export class FeedbackApiError extends ApiError {
  constructor(
    status: number,
    message: string,
    public override readonly code?: string,
  ) {
    super(status, message);
  }
}

export interface FeedbackSubmission {
  fields: FeedbackFields;
  file: File | null;
}

/** multipart/form-data: the browser sets the boundary, so no Content-Type here. */
async function postFeedback(meetingId: string, input: FeedbackSubmission) {
  const form = new FormData();
  form.append("kind", input.fields.kind);
  if (input.fields.category) form.append("category", input.fields.category);
  if (input.fields.text) form.append("text", input.fields.text);
  if (input.file) form.append("file", input.file, input.file.name);

  const res = await fetch(`/api/meetings/${meetingId}/feedback`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { message?: string; code?: string };
      if (body.message) message = body.message;
      code = body.code;
    } catch {
      // ignore parse failure
    }
    throw new FeedbackApiError(res.status, message, code);
  }
  return FeedbackCreateResponse.parse(await res.json());
}

export function useSubmitFeedback(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FeedbackSubmission) => postFeedback(meetingId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: feedbackKey(meetingId) }),
  });
}
