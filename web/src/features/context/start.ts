import { ApiError } from "@/lib/api";
import { putMeetingContext, startMeeting } from "./api";
import { buildPutRequest, isDraftEmpty, type ContextDraft } from "./draft";

export type StartOutcome = "started" | "already-started";

/**
 * Saves the context (only when something was filled in) and starts recognition.
 * A 409 means the meeting has already left AWAITING_START (started elsewhere, or the
 * context is frozen): that is not a failure, the caller just opens the meeting card.
 */
export async function startWithContext(
  meetingId: string,
  draft: ContextDraft,
  lastProtocolMeetingId: string | null | undefined,
): Promise<StartOutcome> {
  try {
    if (!isDraftEmpty(draft)) {
      await putMeetingContext(
        meetingId,
        buildPutRequest(draft, lastProtocolMeetingId),
      );
    }
    await startMeeting(meetingId);
    return "started";
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return "already-started";
    throw err;
  }
}
