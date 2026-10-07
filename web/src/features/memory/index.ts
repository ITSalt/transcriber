import type { FeatureModule } from "@/lib/features";
import { MeetingMemoryRefs } from "./components/MeetingMemoryRefs";
import { ProjectMemoryTabs } from "./components/ProjectMemoryTabs";

// FR-006 project memory (WP-WEB-MEMORY-01): plugs into slots of the shell and
// the project card; it owns no routes. Translations: ./i18n → namespace `memory`.
const memory: FeatureModule = {
  slots: {
    "project.tabs": ProjectMemoryTabs,
    "protocol.toolbar": MeetingMemoryRefs,
  },
};

export default memory;
