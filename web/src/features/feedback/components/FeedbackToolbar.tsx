import { useState } from "react";
import { useTranslation } from "react-i18next";
import { History, MessageSquare } from "lucide-react";
import type { SlotContext } from "@/lib/features";
import { Button } from "@/components/ui/button";
import { FeedbackDialog } from "./FeedbackDialog";
import { VersionHistoryDialog } from "./VersionHistoryDialog";

/** Contribution to the `protocol.toolbar` slot. */
export function FeedbackToolbar({ meetingId }: SlotContext) {
  const { t } = useTranslation("feedback");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!meetingId) return null;

  return (
    <>
      <Button
        variant="outline"
        data-testid="btn-feedback"
        onClick={() => setFeedbackOpen(true)}
      >
        <MessageSquare className="mr-2 h-4 w-4" />
        {t("button")}
      </Button>
      <Button
        variant="outline"
        data-testid="btn-version-history"
        onClick={() => setHistoryOpen(true)}
      >
        <History className="mr-2 h-4 w-4" />
        {t("historyButton")}
      </Button>
      <FeedbackDialog
        meetingId={meetingId}
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
      />
      <VersionHistoryDialog
        meetingId={meetingId}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </>
  );
}
