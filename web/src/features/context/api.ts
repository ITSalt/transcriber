import { useQuery } from "@tanstack/react-query";
import {
  MeetingContextResponse,
  StartMeetingResponse,
  type MeetingContextPutRequest,
} from "@transcrib/shared";
import { ApiError, apiGet, apiPostEmpty, apiPut } from "@/lib/api";

export function putMeetingContext(
  meetingId: string,
  body: MeetingContextPutRequest,
) {
  return apiPut(
    `/api/meetings/${meetingId}/context`,
    body,
    MeetingContextResponse,
  );
}

/** POST /api/meetings/:id/start — freezes the context snapshot and enqueues recognition. */
export function startMeeting(meetingId: string) {
  return apiPostEmpty(`/api/meetings/${meetingId}/start`, StartMeetingResponse);
}

/** Draft before start, frozen snapshot after; null when the meeting has no context. */
export function useMeetingContext(meetingId: string | undefined) {
  return useQuery({
    queryKey: ["meetings", "context", meetingId ?? ""],
    queryFn: async () => {
      try {
        return await apiGet(
          `/api/meetings/${meetingId}/context`,
          MeetingContextResponse,
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!meetingId,
  });
}
