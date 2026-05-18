import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { queryClient } from "@/lib/queryClient";
import { ToastContextProvider } from "@/lib/use-toast";
import { Toaster } from "@/components/ui/toaster";
import CatalogPage from "@/routes/catalog";
import MeetingDetailPage from "@/routes/meeting";
import UploadPage from "@/routes/upload";
import TranscriptPage from "@/routes/transcript";
import ProtocolPage from "@/routes/protocol";

const router = createBrowserRouter([
  {
    path: "/",
    element: <CatalogPage />,
  },
  {
    path: "/catalog",
    element: <CatalogPage />,
  },
  {
    path: "/upload",
    element: <UploadPage />,
  },
  {
    path: "/meetings/:id",
    element: <MeetingDetailPage />,
  },
  {
    path: "/meetings/:id/transcript",
    element: <TranscriptPage />,
  },
  {
    path: "/meetings/:id/protocol",
    element: <ProtocolPage />,
  },
]);

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
