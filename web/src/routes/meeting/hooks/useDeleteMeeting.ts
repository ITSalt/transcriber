import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { MeetingDeleteResponse } from "@transcrib/shared";
import { apiDelete } from "@/lib/api";
import { useToast } from "@/lib/use-toast";

export function useDeleteMeeting(meetingId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();

  return useMutation({
    mutationFn: () =>
      apiDelete(`/api/meetings/${meetingId}`, MeetingDeleteResponse),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast({
        title: t("meeting.delete.successTitle"),
        description: t("meeting.delete.successBody"),
      });
      void navigate("/catalog");
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: t("meeting.delete.errorTitle"),
        description: t("meeting.delete.errorBody"),
      });
    },
  });
}
