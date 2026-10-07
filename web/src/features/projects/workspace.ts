import { LEGACY_WORKSPACE_ID } from "@transcrib/shared";

/**
 * Current workspace id. The workspace switcher (header.right slot) is not part of this
 * package; until it exists the legacy personal workspace (D-7) is used, and a switcher
 * may persist its choice under the `workspace_id` localStorage key.
 */
export function currentWorkspaceId(): string {
  try {
    return localStorage.getItem("workspace_id") ?? LEGACY_WORKSPACE_ID;
  } catch {
    return LEGACY_WORKSPACE_ID;
  }
}
