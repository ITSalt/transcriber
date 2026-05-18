import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface DownloadMenuProps {
  meetingId: string;
}

/**
 * Download buttons for txt/json/md formats.
 * Calls GET /api/meetings/:id/transcript/download with format query param.
 * RQ-020: filename '<meeting-title>-transcript.txt'
 */
export function DownloadMenu({ meetingId }: DownloadMenuProps) {
  const { t } = useTranslation();

  function handleDownload(format: "txt" | "json" | "md") {
    window.location.href = `/api/meetings/${meetingId}/transcript/download?format=${format}`;
  }

  return (
    <div data-testid="download-menu" className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        data-testid="btn-download-txt"
        onClick={() => handleDownload("txt")}
      >
        {t("transcript.downloadTxt")}
      </Button>
      <Button
        variant="outline"
        data-testid="btn-download-json"
        onClick={() => handleDownload("json")}
      >
        {t("transcript.downloadJson")}
      </Button>
      <Button
        variant="outline"
        data-testid="btn-download-md"
        onClick={() => handleDownload("md")}
      >
        {t("transcript.downloadMd")}
      </Button>
    </div>
  );
}
