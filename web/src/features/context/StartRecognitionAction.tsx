import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MeetingDetailResponse } from "@transcrib/shared";
import type { SlotContext } from "@/lib/features";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLastProtocol } from "@/features/projects/api";
import { ContextForm } from "./ContextForm";
import { emptyDraft, isDraftEmpty, type ContextDraft } from "./draft";
import { startWithContext } from "./start";

/**
 * meeting.actions slot: a meeting that was uploaded but never started (AWAITING_START —
 * the user left /upload before pressing «Начать распознавание») can still get its
 * context and be started from its card.
 */
export function StartRecognitionAction({ meetingId }: SlotContext) {
  const { t } = useTranslation("context");
  const queryClient = useQueryClient();
  // same key and schema as the meeting card, so the cache is shared
  const { data } = useQuery({
    queryKey: ["meetings", meetingId ?? ""],
    queryFn: () => apiGet(`/api/meetings/${meetingId}`, MeetingDetailResponse),
    enabled: !!meetingId,
    // the card already fetched it: do not refetch on mount, SSE invalidation keeps it fresh
    staleTime: 30_000,
  });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ContextDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastProtocol = useLastProtocol(draft.projectId);

  if (!meetingId || data?.meeting.status !== "AWAITING_START") return null;

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      await startWithContext(meetingId!, draft, lastProtocol.data?.meeting_id);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["meetings", meetingId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("start.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="meeting-start-open">{t("start.button")}</Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        data-testid="meeting-start-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("start.button")}</DialogTitle>
          <DialogDescription>
            {isDraftEmpty(draft) ? t("start.hintSkip") : t("start.hintReady")}
          </DialogDescription>
        </DialogHeader>
        <ContextForm draft={draft} onChange={setDraft} disabled={busy} />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button
          type="button"
          onClick={() => void handleStart()}
          disabled={busy}
          data-testid="meeting-start-submit"
        >
          {busy ? t("start.starting") : t("start.button")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
