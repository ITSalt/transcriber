import type { FeatureModule } from "@/lib/features";
import { SpeakersConfirmation } from "./SpeakersConfirmation";

// Speaker confirmation (FR-004 / D-38): in AWAITING_SPEAKERS the meeting card shows a block
// to name the diarization labels before the protocol is generated.
export const slots: FeatureModule["slots"] = {
  "meeting.actions": SpeakersConfirmation,
};
