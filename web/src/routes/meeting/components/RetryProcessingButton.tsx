import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRetryMeeting } from "../hooks/useRetryMeeting";

interface RetryProcessingButtonProps {
  meetingId: string;
}

/**
 * CMP-RetryProcessing — RQ-036.
 * Rendered ONLY when Meeting.status === 'FAILED' (the parent gates it).
 * Clicking opens a confirmation dialog; confirming fires POST /api/meetings/:id/retry.
 * Button is disabled while the mutation is in flight (RQ-035).
 */
export function RetryProcessingButton({ meetingId }: RetryProcessingButtonProps) {
  const { t } = useTranslation();
  const [showDialog, setShowDialog] = useState(false);
  const retryMutation = useRetryMeeting(meetingId);

  function handleConfirm() {
    setShowDialog(false);
    retryMutation.mutate();
  }

  return (
    <>
      <Button
        variant="outline"
        data-testid="btn-retry"
        disabled={retryMutation.isPending}
        onClick={() => setShowDialog(true)}
      >
        {t("meeting.retry.action")}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent data-testid="retry-confirm-dialog">
          <DialogHeader>
            <DialogTitle>{t("meeting.retry.confirmTitle")}</DialogTitle>
          </DialogHeader>
          <DialogDescription>{t("meeting.retry.confirmBody")}</DialogDescription>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              data-testid="btn-retry-cancel"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleConfirm}
              data-testid="btn-retry-confirm"
            >
              {t("meeting.retry.action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
