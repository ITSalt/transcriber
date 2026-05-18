import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { queryClient } from "@/lib/queryClient";
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
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
