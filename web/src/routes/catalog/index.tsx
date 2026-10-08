import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { apiGet } from "@/lib/api";
import { WorkspaceMeetingListResponse } from "@transcrib/shared";
import { useWorkspaceId } from "@/lib/session";
import { Button } from "@/components/ui/button";
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

function useMeetingList(workspaceId: string | undefined) {
  return useQuery({
    // the workspace is part of the key: switching it never shows another workspace's list
    queryKey: ["meetings", workspaceId],
    queryFn: () =>
      apiGet(
        `/api/meetings?workspace_id=${encodeURIComponent(workspaceId ?? "")}`,
        WorkspaceMeetingListResponse,
      ),
    enabled: Boolean(workspaceId),
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
  const workspaceId = useWorkspaceId();
  const { data, isLoading, isError, refetch } = useMeetingList(workspaceId);

  return (
    <div data-testid="catalog-page" className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("catalog.title")}</h1>
        <Button asChild>
          <Link to="/upload" data-testid="upload-button">
            {t("nav.upload")}
          </Link>
        </Button>
      </div>

      {isLoading && (
        <p data-testid="catalog-loading">{t("common.loading")}</p>
      )}

      {isError && (
        <div data-testid="catalog-error">
          <p>{t("common.error")}</p>
          <Button variant="outline" onClick={() => refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      {data && data.items.length === 0 && (
        <p data-testid="catalog-empty">{t("catalog.empty")}</p>
      )}

      {data && data.items.length > 0 && (
        <Table aria-label={t("catalog.tableLabel")}>
          <TableHeader>
            <tr>
              <TableHead>{t("catalog.columns.file")}</TableHead>
              <TableHead>{t("catalog.columns.date")}</TableHead>
              <TableHead>{t("catalog.columns.status")}</TableHead>
              <TableHead>{t("catalog.columns.protocol")}</TableHead>
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
