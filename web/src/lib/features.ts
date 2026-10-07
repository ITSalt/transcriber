import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

/**
 * Feature auto-registration (D-15).
 *
 * A feature is a folder `web/src/features/<name>/` whose `index.ts(x)` exports
 * `{ routes, navItems?, slots? }`. It is picked up through `import.meta.glob`,
 * so adding a feature never requires editing `App.tsx` or `i18n/`.
 * Feature translations live in `features/<name>/i18n/{ru,en}.json` and are
 * registered as the i18next namespace `<name>` (see `i18n/config.ts`).
 */

export const SLOT_NAMES = [
  "header.right",
  "meeting.actions",
  "protocol.toolbar",
  "project.tabs",
] as const;

export type SlotName = (typeof SLOT_NAMES)[number];

/** Props every slot component receives; hosts pass whatever context they have. */
export interface SlotContext {
  meetingId?: string;
  projectId?: string;
}

export interface NavItem {
  to: string;
  /** i18n key, resolved with the app `t` (or `<ns>:key` for a feature namespace). */
  labelKey: string;
  order?: number;
}

export interface FeatureModule {
  routes?: RouteObject[];
  navItems?: NavItem[];
  slots?: Partial<Record<SlotName, ComponentType<SlotContext>>>;
}

export interface FeatureRegistry {
  routes: RouteObject[];
  navItems: NavItem[];
  slots: Record<SlotName, ComponentType<SlotContext>[]>;
}

type RawModule = FeatureModule & { default?: FeatureModule };

export function collectFeatures(
  modules: Record<string, RawModule>,
): FeatureRegistry {
  const registry: FeatureRegistry = {
    routes: [],
    navItems: [],
    slots: {
      "header.right": [],
      "meeting.actions": [],
      "protocol.toolbar": [],
      "project.tabs": [],
    },
  };

  // Sorted by path so the order never depends on glob iteration order.
  for (const path of Object.keys(modules).sort()) {
    const raw = modules[path]!;
    const mod: FeatureModule = raw.default ?? raw;
    registry.routes.push(...(mod.routes ?? []));
    registry.navItems.push(...(mod.navItems ?? []));
    for (const name of SLOT_NAMES) {
      const component = mod.slots?.[name];
      if (component) registry.slots[name].push(component);
    }
  }

  registry.navItems.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  return registry;
}

export const featureRegistry: FeatureRegistry = collectFeatures(
  import.meta.glob<RawModule>("../features/*/index.{ts,tsx}", {
    eager: true,
  }),
);
