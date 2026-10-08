import { createElement, Fragment } from "react";
import type { FeatureModule } from "@/lib/features";
import { ContextSnapshotAction } from "./ContextSnapshotAction";
import { StartRecognitionAction } from "./StartRecognitionAction";

// Context feature (FR-004): the pre-recognition form is used by routes/upload,
// the frozen snapshot is shown on the meeting card through the meeting.actions slot.
export const slots: FeatureModule["slots"] = {
  "meeting.actions": function MeetingContextActions(props) {
    return createElement(
      Fragment,
      null,
      createElement(StartRecognitionAction, props),
      createElement(ContextSnapshotAction, props),
    );
  },
};
