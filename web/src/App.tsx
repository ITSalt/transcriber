import { QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserRouter,
  RouterProvider,
  type RouteObject,
} from "react-router";
import { queryClient } from "@/lib/queryClient";
import { ToastContextProvider } from "@/lib/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/layout/app-shell";
import { FeatureRegistryContext } from "@/components/layout/slot";
import { featureRegistry, type FeatureRegistry } from "@/lib/features";
import CatalogPage from "@/routes/catalog";
import MeetingDetailPage from "@/routes/meeting";
import UploadPage from "@/routes/upload";
import TranscriptPage from "@/routes/transcript";
import ProtocolPage from "@/routes/protocol";

export function createAppRoutes(
  registry: FeatureRegistry = featureRegistry,
): RouteObject[] {
  return [
    {
      element: (
        <FeatureRegistryContext.Provider value={registry}>
          <AppShell />
        </FeatureRegistryContext.Provider>
      ),
      children: [
        { path: "/", element: <CatalogPage /> },
        { path: "/catalog", element: <CatalogPage /> },
        { path: "/upload", element: <UploadPage /> },
        { path: "/meetings/:id", element: <MeetingDetailPage /> },
        { path: "/meetings/:id/transcript", element: <TranscriptPage /> },
        { path: "/meetings/:id/protocol", element: <ProtocolPage /> },
        // Feature routes are auto-registered (see lib/features.ts).
        ...registry.routes,
      ],
    },
  ];
}

const router = createBrowserRouter(createAppRoutes());

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastContextProvider>
        <RouterProvider router={router} />
        <Toaster />
      </ToastContextProvider>
    </QueryClientProvider>
  );
}
