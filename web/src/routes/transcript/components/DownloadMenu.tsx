import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface DownloadMenuProps {
  meetingId: string;
}

/**
 * Download button for transcript plain-text.
 * Calls GET /api/meetings/:id/transcript/download — BE returns text/plain only (RQ-020).
 */
export function DownloadMenu({ meetingId }: DownloadMenuProps) {
  const { t } = useTranslation();

  function handleDownload() {
    window.location.href = `/api/meetings/${meetingId}/transcript/download`;
  }

  return (
    <div data-testid="download-menu" className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        data-testid="btn-download-txt"
        onClick={handleDownload}
      >
        {t("transcript.downloadTxt")}
      </Button>
    </div>
  );
}
