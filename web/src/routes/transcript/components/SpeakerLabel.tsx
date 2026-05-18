import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

interface SpeakerLabelProps {
  speakerId: string;
  speakerMap: Record<string, string | null> | null;
}

/**
 * Resolves a speaker ID to a display name.
 * BRQ-021: Unresolved speakers shown as "Speaker N"; resolved speakers show the real name.
 */
export function SpeakerLabel({ speakerId, speakerMap }: SpeakerLabelProps) {
  const { t } = useTranslation();

  const resolved = speakerMap?.[speakerId];
  // Speaker IDs are typically "spk_0", "spk_1", etc. Extract the numeric part.
  const n = speakerId.replace(/\D/g, "") || speakerId;
  const label =
    resolved ?? t("transcript.speakerLabel", { n, defaultValue: `Speaker ${n}` });

  return (
    <Badge
      variant="secondary"
      data-testid={`speaker-label-${speakerId}`}
      className="text-xs font-semibold"
    >
      {label}
    </Badge>
  );
}
