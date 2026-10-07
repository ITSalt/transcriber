import type { RouteObject } from "react-router";
import type { NavItem } from "@/lib/features";

// Shell feature: top-level navigation for the core pages.
// Routes of the core pages stay in App.tsx; other features add their own.
export const routes: RouteObject[] = [];

export const navItems: NavItem[] = [
  { to: "/catalog", labelKey: "nav.catalog", order: 10 },
  { to: "/upload", labelKey: "nav.upload", order: 20 },
];
