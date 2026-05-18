import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { apiGet } from "@/lib/api";
import { MeetingListResponse } from "@transcrib/shared";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
} from "@/components/ui/table";
import { MeetingRow } from "./components/MeetingRow";

const TRANSIENT_STATUSES = new Set([
  "UPLOADING",
  "TRANSCRIBING",
  "GENERATING_PROTOCOL",
]);

function useMeetingList() {
  return useQuery({
    queryKey: ["meetings"],
    queryFn: () => apiGet("/api/meetings", MeetingListResponse),
    // Poll while any meeting is in a transient state
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasTransient = items.some((m) => TRANSIENT_STATUSES.has(m.status));
      return hasTransient ? 5000 : false;
    },
  });
}

export default function CatalogPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useMeetingList();
  const queryClient = useQueryClient();

  // Subscribe to SSE for real-time status updates (guard for SSR/test environments)
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource("/api/meetings/events");

    source.addEventListener("meeting.status", (e: MessageEvent) => {
      type StatusEvent = { id: string };
      try {
        const payload = JSON.parse(e.data as string) as StatusEvent;
        // Invalidate list so the changed meeting gets fresh data
        void queryClient.invalidateQueries({ queryKey: ["meetings"] });
        void queryClient.invalidateQueries({
          queryKey: ["meetings", payload.id],
        });
      } catch {
        // ignore malformed events
      }
    });

    return () => {
      source.close();
    };
  }, [queryClient]);

  return (
    <div data-testid="catalog-page" className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">{t("catalog.title")}</h1>

      {isLoading && (
        <p data-testid="catalog-loading">{t("common.loading")}</p>
      )}

      {isError && (
        <div data-testid="catalog-error">
          <p>{t("common.error")}</p>
          <button onClick={() => refetch()}>{t("common.retry")}</button>
        </div>
      )}

      {data && data.items.length === 0 && (
        <p data-testid="catalog-empty">{t("catalog.empty")}</p>
      )}

      {data && data.items.length > 0 && (
        <Table>
          <TableHeader>
            <tr>
              <TableHead>{t("catalog.columns.title")}</TableHead>
              <TableHead>{t("catalog.columns.status")}</TableHead>
              <TableHead>{t("catalog.columns.language")}</TableHead>
              <TableHead>{t("catalog.columns.uploaded_at")}</TableHead>
              <TableHead>{t("catalog.columns.duration")}</TableHead>
              <TableHead />
            </tr>
          </TableHeader>
          <TableBody>
            {data.items.map((meeting) => (
              <MeetingRow key={meeting.id} meeting={meeting} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
