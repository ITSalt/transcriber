import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RetryMeetingFullResponse } from "@transcrib/shared";
import { apiPostEmpty, ApiError } from "@/lib/api";
import { useToast } from "@/lib/use-toast";

export function useRetryMeeting(meetingId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { toast } = useToast();

  return useMutation({
    mutationFn: () =>
      apiPostEmpty(
        `/api/meetings/${meetingId}/retry`,
        RetryMeetingFullResponse,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["meetings", meetingId],
      });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        // 409 MEETING_NOT_FAILED or RETRY_ALREADY_IN_FLIGHT — safe no-op, refresh state
        void queryClient.invalidateQueries({
          queryKey: ["meetings", meetingId],
        });
        toast({
          title: t("meeting.retry.conflictTitle"),
          description: t("meeting.retry.conflictBody"),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("meeting.retry.errorTitle"),
          description: t("meeting.retry.errorBody"),
        });
      }
    },
  });
}
