import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import type { MeetingListItem } from "@transcrib/shared";

interface MeetingRowProps {
  meeting: MeetingListItem;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function MeetingRow({ meeting }: MeetingRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const displayTitle = meeting.title ?? meeting.filename;

  return (
    <TableRow data-testid={`meeting-row-${meeting.id}`}>
      <TableCell className="font-medium">{displayTitle}</TableCell>
      <TableCell>
        <StatusBadge status={meeting.status} />
      </TableCell>
      <TableCell>{meeting.language ?? "—"}</TableCell>
      <TableCell>{formatDate(meeting.uploaded_at)}</TableCell>
      <TableCell>
        {meeting.duration_sec != null
          ? formatDuration(meeting.duration_sec)
          : "—"}
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
