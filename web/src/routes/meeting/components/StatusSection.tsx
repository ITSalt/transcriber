import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import type { MeetingStatus } from "@transcrib/shared";

interface StatusSectionProps {
  meetingId: string;
  status: MeetingStatus;
  transcriptExists: boolean;
  protocolExists: boolean;
  onDelete: () => void;
}

/**
 * RQ-005 — Action links gated by status:
 * - 'View transcript': enabled when status in
 *   {TRANSCRIBED, GENERATING_PROTOCOL, PROTOCOL_READY, EDITED}
 * - 'Review/Edit protocol': enabled when status in {PROTOCOL_READY, EDITED}
 * - 'Export PDF': enabled when status in {PROTOCOL_READY, EDITED}
 */
const TRANSCRIPT_STATUSES: MeetingStatus[] = [
  "TRANSCRIBED",
  "GENERATING_PROTOCOL",
  "PROTOCOL_READY",
  "EDITED",
];

const PROTOCOL_STATUSES: MeetingStatus[] = ["PROTOCOL_READY", "EDITED"];

export function StatusSection({
  meetingId,
  status,
  transcriptExists,
  protocolExists,
  onDelete,
}: StatusSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const canViewTranscript =
    transcriptExists && TRANSCRIPT_STATUSES.includes(status);
  const canViewProtocol =
    protocolExists && PROTOCOL_STATUSES.includes(status);
  const canExportPdf = PROTOCOL_STATUSES.includes(status);

  return (
    <div className="flex flex-wrap gap-3">
      {canViewTranscript && (
        <Button
          data-testid="btn-view-transcript"
          onClick={() => void navigate(`/meetings/${meetingId}/transcript`)}
        >
          {t("meeting.detail.viewTranscript")}
        </Button>
      )}

      {canViewProtocol && (
        <Button
          data-testid="btn-view-protocol"
          onClick={() => void navigate(`/meetings/${meetingId}/protocol`)}
        >
          {t("meeting.detail.viewProtocol")}
        </Button>
      )}

      {canExportPdf && (
        <Button
          variant="outline"
          data-testid="btn-export-pdf"
          onClick={() => {
            window.location.href = `/api/meetings/${meetingId}/protocol/pdf`;
          }}
        >
          {t("meeting.detail.exportPdf")}
        </Button>
      )}

      <Button
        variant="destructive"
        data-testid="btn-delete"
        onClick={() => setShowDeleteDialog(true)}
      >
        {t("common.delete")}
      </Button>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent data-testid="delete-confirm-dialog">
          <DialogHeader>
            <DialogTitle>{t("meeting.detail.deleteConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <p>{t("meeting.detail.deleteConfirmBody")}</p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              data-testid="btn-delete-cancel"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDeleteDialog(false);
                onDelete();
              }}
              data-testid="btn-delete-confirm"
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
