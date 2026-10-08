import { useQuery } from "@tanstack/react-query";
import {
  SpeakersPutResponse,
  SpeakersResponse,
  type SpeakersPutRequest,
} from "@transcrib/shared";
import { apiGet, apiPut } from "@/lib/api";

/** GET /api/meetings/:id/speakers — labels with samples and the project's participants. */
export function useSpeakers(meetingId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["meetings", meetingId ?? "", "speakers"],
    queryFn: () =>
      apiGet(`/api/meetings/${meetingId}/speakers`, SpeakersResponse),
    enabled: !!meetingId && enabled,
  });
}

/** PUT /api/meetings/:id/speakers — confirm or skip; moves the meeting to GENERATING_PROTOCOL. */
export function putSpeakers(meetingId: string, body: SpeakersPutRequest) {
  return apiPut(
    `/api/meetings/${meetingId}/speakers`,
    body,
    SpeakersPutResponse,
  );
}
