import type { RouteObject } from "react-router";
import type { NavItem } from "@/lib/features";

// Projects feature (FR-004): list / create / card with participants and glossary.
// Pages are lazy: the card renders the `project.tabs` slot, and importing slot.tsx
// eagerly from here would be a cycle through the feature registry (lib/features.ts).
export const routes: RouteObject[] = [
  {
    path: "/projects",
    lazy: async () => ({
      Component: (await import("./ProjectsListPage")).default,
    }),
  },
  {
    path: "/projects/:projectId",
    lazy: async () => ({
      Component: (await import("./ProjectDetailPage")).default,
    }),
  },
];

export const navItems: NavItem[] = [
  { to: "/projects", labelKey: "projects:nav", order: 15 },
];
