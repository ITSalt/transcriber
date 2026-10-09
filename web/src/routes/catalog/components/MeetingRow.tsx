import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import type { WorkspaceMeetingListItem } from "@transcrib/shared";

interface MeetingRowProps {
  meeting: WorkspaceMeetingListItem;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** The protocol exists once generation finished (see StatusBadge statuses). */
const HAS_PROTOCOL = new Set(["PROTOCOL_READY", "EDITED"]);

export function MeetingRow({ meeting }: MeetingRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <TableRow data-testid={`meeting-row-${meeting.id}`}>
      <TableCell className="font-medium">
        <span data-testid={`meeting-title-${meeting.id}`}>
          {meeting.title ?? meeting.filename}
        </span>
        {meeting.title && (
          <span className="block text-xs font-normal text-muted-foreground">
            {meeting.filename}
          </span>
        )}
      </TableCell>
      <TableCell>
        {meeting.project_id ? (
          <Link
            to={`/projects/${meeting.project_id}`}
            className="text-primary underline-offset-4 hover:underline"
            data-testid={`project-link-${meeting.id}`}
          >
            {meeting.project_name}
          </Link>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>{formatDate(meeting.uploaded_at)}</TableCell>
      <TableCell>
        <StatusBadge status={meeting.status} />
      </TableCell>
      <TableCell>
        {HAS_PROTOCOL.has(meeting.status) ? (
          <Link
            to={`/meetings/${meeting.id}/protocol`}
            className="font-medium text-primary underline-offset-4 hover:underline"
            data-testid={`protocol-link-${meeting.id}`}
          >
            {t("catalog.openProtocol")}
          </Link>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/meetings/${meeting.id}`)}
          data-testid={`open-meeting-${meeting.id}`}
        >
          {t("catalog.open")}
        </Button>
      </TableCell>
    </TableRow>
  );
}
