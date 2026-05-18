import { useEffect } from "react";
import { useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiGet } from "@/lib/api";
import { MeetingDetailResponse } from "@transcrib/shared";
import { MetadataCard } from "./components/MetadataCard";
import { StatusSection } from "./components/StatusSection";
import { JobErrorBanner } from "./components/JobErrorBanner";
import { useDeleteMeeting } from "./hooks/useDeleteMeeting";

function useMeetingDetail(id: string) {
  return useQuery({
    queryKey: ["meetings", id],
    queryFn: () => apiGet(`/api/meetings/${id}`, MeetingDetailResponse),
    enabled: Boolean(id),
  });
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const meetingId = id ?? "";
  const { data, isLoading, isError, refetch } = useMeetingDetail(meetingId);
  const deleteMutation = useDeleteMeeting(meetingId);

  // RQ-002 — SSE subscribe for real-time status updates
  useEffect(() => {
    if (!meetingId || typeof EventSource === "undefined") return;

    const source = new EventSource(`/api/meetings/${meetingId}/events`);

    source.addEventListener("meeting.status", () => {
      void queryClient.invalidateQueries({
        queryKey: ["meetings", meetingId],
      });
    });

    return () => {
      source.close();
    };
  }, [meetingId, queryClient]);

  // Determine if any job is in progress (RQ-007)
  const jobInProgress =
    data?.latest_transcription_job?.status === "PROCESSING" ||
    data?.latest_protocol_job?.status === "PROCESSING";

  return (
    <div data-testid="meeting-detail-page" className="container mx-auto py-8 px-4 max-w-3xl">
      {isLoading && (
        <p data-testid="meeting-detail-loading">{t("common.loading")}</p>
      )}

      {isError && (
        <div data-testid="meeting-detail-error">
          <p>{t("common.error")}</p>
          <button onClick={() => refetch()}>{t("common.retry")}</button>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Error banner — RQ-004 */}
          {data.meeting.status === "ERROR" && (
            <JobErrorBanner
              transcriptionJob={data.latest_transcription_job}
              protocolJob={data.latest_protocol_job}
            />
          )}

          <MetadataCard
            meeting={data.meeting}
            recording={data.recording}
          />

          <StatusSection
            meetingId={meetingId}
            status={data.meeting.status}
            transcriptExists={data.transcript_exists}
            protocolExists={data.protocol_exists}
            meetingTitle={data.meeting.title ?? undefined}
            jobInProgress={jobInProgress}
            isDeleting={deleteMutation.isPending}
            onDelete={() => deleteMutation.mutate()}
          />
        </div>
      )}
    </div>
  );
}
