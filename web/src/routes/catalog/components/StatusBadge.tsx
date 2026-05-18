import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { MeetingStatus } from "@transcrib/shared";

interface StatusBadgeProps {
  status: MeetingStatus;
}

const TRANSIENT_STATUSES: MeetingStatus[] = [
  "UPLOADING",
  "TRANSCRIBING",
  "GENERATING_PROTOCOL",
];

function getVariant(
  status: MeetingStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ERROR") return "destructive";
  if (status === "PROTOCOL_READY" || status === "EDITED") return "default";
  if (TRANSIENT_STATUSES.includes(status)) return "secondary";
  return "outline";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  const label = t(`catalog.status.${status}`, { defaultValue: status });
  const isTransient = TRANSIENT_STATUSES.includes(status);

  return (
    <Badge
      variant={getVariant(status)}
      className={isTransient ? "animate-pulse" : undefined}
      data-testid={`status-badge-${status}`}
    >
      {label}
    </Badge>
  );
}
