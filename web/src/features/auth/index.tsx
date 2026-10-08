import type { RouteObject } from "react-router";
import type { FeatureModule } from "@/lib/features";
import LoginPage from "./LoginPage";
import { AuthHeader } from "./components/AuthHeader";

// Sign-in screen (/login) plus the workspace switcher and user menu in the header.
// Route guarding itself lives in AppShell (everything except /login needs a session).
export const routes: RouteObject[] = [{ path: "/login", element: <LoginPage /> }];

export const slots: FeatureModule["slots"] = {
  "header.right": AuthHeader,
};
