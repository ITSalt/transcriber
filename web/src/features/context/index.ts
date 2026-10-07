import type { FeatureModule } from "@/lib/features";
import { ContextSnapshotAction } from "./ContextSnapshotAction";

// Context feature (FR-004): the pre-recognition form is used by routes/upload,
// the frozen snapshot is shown on the meeting card through the meeting.actions slot.
export const slots: FeatureModule["slots"] = {
  "meeting.actions": ContextSnapshotAction,
};
