import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import type { MeetingStatus } from "@transcrib/shared";
import { RetryProcessingButton } from "./RetryProcessingButton";

interface StatusSectionProps {
  meetingId: string;
  status: MeetingStatus;
  transcriptExists: boolean;
  protocolExists: boolean;
  meetingTitle?: string;
  jobInProgress?: boolean;
  isDeleting?: boolean;
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
  meetingTitle,
  jobInProgress = false,
  isDeleting = false,
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

  function handleConfirmDelete() {
    setShowDeleteDialog(false);
    onDelete();
  }

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

      {/* CMP-RetryProcessing — RQ-036: only visible when FAILED */}
      {status === "FAILED" && (
        <RetryProcessingButton meetingId={meetingId} />
      )}

      <Button
        variant="destructive"
        data-testid="btn-delete"
        disabled={isDeleting}
        onClick={() => setShowDeleteDialog(true)}
      >
        {t("common.delete")}
      </Button>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent data-testid="delete-confirm-dialog">
          <DialogHeader>
            <DialogTitle>{t("meeting.delete.confirmTitle")}</DialogTitle>
          </DialogHeader>
          {meetingTitle && (
            <p
              className="font-medium text-sm"
              data-testid="delete-dialog-meeting-title"
            >
              {meetingTitle}
            </p>
          )}
          <DialogDescription>
            {t("meeting.delete.confirmBody")}
          </DialogDescription>
          {jobInProgress && (
            <p
              className="text-sm text-amber-600"
              data-testid="delete-dialog-inflight-warning"
            >
              {t("meeting.delete.inFlightWarning")}
            </p>
          )}
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
              onClick={handleConfirmDelete}
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
