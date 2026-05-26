import { useTranslation } from "react-i18next";
import type { MeetingDetailResponse } from "@transcrib/shared";

type Job = NonNullable<MeetingDetailResponse["latest_transcription_job"]>;

interface JobErrorBannerProps {
  transcriptionJob: Job | null;
  protocolJob: Job | null;
}

/**
 * RQ-004 — surfaces the current job's error_reason when Meeting.status=FAILED.
 */
export function JobErrorBanner({
  transcriptionJob,
  protocolJob,
}: JobErrorBannerProps) {
  const { t } = useTranslation();

  const errorReason =
    protocolJob?.error_reason ?? transcriptionJob?.error_reason ?? null;

  if (!errorReason) return null;

  return (
    <div
      role="alert"
      data-testid="meeting-error_reason"
      className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700"
    >
      <p className="font-semibold mb-1">{t("meeting.detail.error_reason")}</p>
      <p>{errorReason}</p>
    </div>
  );
}
