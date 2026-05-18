import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiGet } from "@/lib/api";
import { TranscriptResponse } from "@transcrib/shared";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentList } from "./components/SegmentList";
import { DownloadMenu } from "./components/DownloadMenu";

function useTranscript(meetingId: string) {
  return useQuery({
    queryKey: ["transcript", meetingId],
    queryFn: () =>
      apiGet(`/api/meetings/${meetingId}/transcript`, TranscriptResponse),
    enabled: Boolean(meetingId),
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function languageLabel(
  lang: string,
  t: (key: string) => string,
): string {
  const key = `transcript.language${lang}` as const;
  return t(key);
}

export default function TranscriptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const meetingId = id ?? "";
  const { data, isLoading, isError, refetch } = useTranscript(meetingId);

  return (
    <div
      data-testid="transcript-page"
      className="container mx-auto py-8 px-4 max-w-4xl"
    >
      {/* Back button */}
      <div className="mb-4">
        <Button
          variant="outline"
          data-testid="btn-back-to-meeting"
          onClick={() => void navigate(`/meetings/${meetingId}`)}
        >
          {t("transcript.backToMeeting")}
        </Button>
      </div>

      {isLoading && (
        <p data-testid="transcript-loading">{t("transcript.loading")}</p>
      )}

      {isError && (
        <div data-testid="transcript-error">
          <p>{t("transcript.error")}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Header Card — metadata */}
          <Card>
            <CardHeader>
              <CardTitle data-testid="transcript-title">
                {t("transcript.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Language */}
              <div>
                <span className="text-sm text-muted-foreground">
                  {t("transcript.language")}
                </span>
                <div className="mt-1">
                  <Badge
                    variant="outline"
                    data-testid="transcript-language"
                  >
                    {languageLabel(data.language, t)}
                  </Badge>
                </div>
              </div>

              {/* Segments count */}
              <div>
                <span className="text-sm text-muted-foreground">
                  {t("transcript.segments")}
                </span>
                <p
                  data-testid="transcript-segments_count"
                  className="font-medium"
                >
                  {data.segments_count}
                </p>
              </div>

              {/* Speakers count */}
              <div>
                <span className="text-sm text-muted-foreground">
                  {t("transcript.speakers")}
                </span>
                <p
                  data-testid="transcript-speakers_count"
                  className="font-medium"
                >
                  {data.speakers_count}
                </p>
              </div>

              {/* Created at */}
              <div>
                <span className="text-sm text-muted-foreground">
                  {t("transcript.created")}
                </span>
                <p data-testid="transcript-created_at">
                  {formatDate(data.created_at)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Download buttons */}
          <DownloadMenu meetingId={meetingId} />

          {/* Transcript content */}
          <Card>
            <CardHeader>
              <CardTitle>{t("transcript.transcriptContent")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div data-testid="transcript-full_text">
                <SegmentList fullText={data.full_text} />
              </div>
            </CardContent>
          </Card>

          {/* Speaker map (debug) */}
          {data.speaker_map && (
            <Card>
              <CardHeader>
                <CardTitle>{t("transcript.speakerMap")}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre
                  data-testid="transcript-speaker_map"
                  className="text-xs bg-muted p-3 rounded overflow-auto"
                >
                  {JSON.stringify(data.speaker_map, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
