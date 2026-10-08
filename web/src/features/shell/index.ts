import { createElement } from "react";
import type { RouteObject } from "react-router";
import { NotFound } from "@/components/NotFound";
import type { NavItem } from "@/lib/features";

// Shell feature: top-level navigation for the core pages and the catch-all 404.
// Routes of the core pages stay in App.tsx; other features add their own.
export const routes: RouteObject[] = [
  { path: "*", element: createElement(NotFound) },
];

export const navItems: NavItem[] = [
  { to: "/catalog", labelKey: "nav.catalog", order: 10 },
  { to: "/upload", labelKey: "nav.upload", order: 20 },
];
