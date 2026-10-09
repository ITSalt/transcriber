import type {
  SpeakerLabel,
  SpeakerMappingEntry,
  SpeakerParticipant,
} from "@transcrib/shared";

/** What the author picked for one diarization label. */
export type Choice =
  | { kind: "keep" }
  | { kind: "participant"; participantId: string }
  | { kind: "name"; name: string }
  /** «the same person as label K» — K always has a lower index, so chains never loop. */
  | { kind: "merge"; target: string };

export type Choices = Record<string, Choice>;

/** Pre-fill from the current speaker_map: a chosen participant, else the worker's name, else keep. */
export function initialChoices(
  labels: SpeakerLabel[],
  participants: SpeakerParticipant[],
): Choices {
  const result: Choices = {};
  for (const l of labels) {
    if (l.participant_id && participants.some((p) => p.id === l.participant_id)) {
      result[l.label] = { kind: "participant", participantId: l.participant_id };
    } else if (l.name) {
      result[l.label] = { kind: "name", name: l.name };
    } else {
      result[l.label] = { kind: "keep" };
    }
  }
  return result;
}

/** «SPEAKER_0» → 1 (n+1); a label without a trailing number reads as 1. */
export function speakerNumber(label: string): number {
  const m = /(\d+)$/.exec(label);
  return m ? Number(m[1]) + 1 : 1;
}

/** Follows merges to the label that carries the actual choice. */
export function resolveRoot(choices: Choices, label: string): string {
  let current = label;
  for (let i = 0; i < 100; i++) {
    const c = choices[current];
    if (c?.kind !== "merge") return current;
    current = c.target;
  }
  return current;
}

/** Labels whose free-form name is empty (the root of a merge counts for its members). */
export function invalidLabels(choices: Choices): string[] {
  return Object.keys(choices).filter((label) => {
    const root = choices[resolveRoot(choices, label)];
    return root?.kind === "name" && root.name.trim() === "";
  });
}

/**
 * Body entries of a «confirm». «Keep» is left out (the current value stays);
 * a merged label copies the choice of the label it points to.
 */
export function buildMapping(
  choices: Choices,
  displays: Record<string, string> = {},
): SpeakerMappingEntry[] {
  const entries: SpeakerMappingEntry[] = [];
  for (const label of Object.keys(choices)) {
    const choice = choices[label]!;
    if (choice.kind === "keep") continue;
    const rootLabel = resolveRoot(choices, label);
    const effective = choices[rootLabel]!;
    if (effective.kind === "participant") {
      entries.push({ label, participant_id: effective.participantId });
    } else if (effective.kind === "name") {
      entries.push({ label, name: effective.name.trim() });
    } else {
      // merged into a «keep» label: the worker puts a null as «Speaker <own index>», which would
      // not merge — send the root's neutral name so both labels read as one speaker
      entries.push({ label, name: displays[rootLabel] ?? null });
    }
  }
  return entries;
}

export function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDuration(sec: number): string {
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
