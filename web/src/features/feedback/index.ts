import type { FeatureModule } from "@/lib/features";
import { FeedbackToolbar } from "./components/FeedbackToolbar";

// FR-005: feedback panel and protocol version history, mounted into the
// protocol page toolbar slot (D-15).
export const routes: NonNullable<FeatureModule["routes"]> = [];

export const slots: NonNullable<FeatureModule["slots"]> = {
  "protocol.toolbar": FeedbackToolbar,
};
