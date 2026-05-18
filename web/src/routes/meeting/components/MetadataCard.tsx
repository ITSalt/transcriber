import { useTranslation } from "react-i18next";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MeetingDetailResponse } from "@transcrib/shared";

type Meeting = MeetingDetailResponse["meeting"];
type Recording = MeetingDetailResponse["recording"];

interface MetadataCardProps {
  meeting: Meeting;
  recording: Recording;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function humanizeBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function MetadataCard({ meeting, recording }: MetadataCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("meeting.detail.metadataTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Title */}
        <div>
          <span className="text-sm text-muted-foreground">
            {t("meeting.detail.title")}
          </span>
          <p data-testid="meeting-title" className="font-medium">
            {meeting.title ?? "—"}
          </p>
        </div>

        {/* Language */}
        <div>
          <span className="text-sm text-muted-foreground">
            {t("meeting.detail.language")}
          </span>
          <p data-testid="meeting-language">{meeting.language ?? "—"}</p>
        </div>

        {/* Status */}
        <div>
          <span className="text-sm text-muted-foreground">
            {t("meeting.detail.status")}
          </span>
          <div className="mt-1">
            <Badge
              data-testid="meeting-status"
              variant={meeting.status === "ERROR" ? "destructive" : "secondary"}
            >
              {t(`catalog.status.${meeting.status}`, {
                defaultValue: meeting.status,
              })}
            </Badge>
          </div>
        </div>

        {/* Uploaded at */}
        <div>
          <span className="text-sm text-muted-foreground">
            {t("meeting.detail.uploaded_at")}
          </span>
          <p data-testid="meeting-uploaded_at">
            {formatDate(meeting.uploaded_at)}
          </p>
        </div>

        {/* Last update */}
        <div>
          <span className="text-sm text-muted-foreground">
            {t("meeting.detail.updated_at")}
          </span>
          <p data-testid="meeting-updated_at">
            {formatDate(meeting.updated_at)}
          </p>
        </div>

        {/* File name */}
        <div>
          <span className="text-sm text-muted-foreground">
            {t("meeting.detail.filename")}
          </span>
          <p data-testid="meeting-filename">{recording.filename}</p>
        </div>

        {/* Size */}
        <div>
          <span className="text-sm text-muted-foreground">
            {t("meeting.detail.size_bytes")}
          </span>
          <p data-testid="meeting-size_bytes">
            {humanizeBytes(recording.size_bytes)}
          </p>
        </div>

        {/* Format */}
        <div>
          <span className="text-sm text-muted-foreground">
            {t("meeting.detail.mime_type")}
          </span>
          <p data-testid="meeting-mime_type">{recording.mime_type}</p>
        </div>

        {/* Duration */}
        <div>
          <span className="text-sm text-muted-foreground">
            {t("meeting.detail.duration_sec")}
          </span>
          <p data-testid="meeting-duration_sec">
            {recording.duration_sec != null
              ? formatDuration(recording.duration_sec)
              : "—"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
