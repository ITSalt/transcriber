import {
  ASR_KEYTERMS_MAX,
  PREVIOUS_PROTOCOL_MAX_CHARS,
  type MeetingContextPutRequest,
  type MeetingType,
  type PreviousProtocol,
  type ProjectDetailResponse,
} from "@transcrib/shared";
import type {
  ParticipantValue,
  TermValue,
} from "@/features/projects/forms";

/** How the previous protocol is supplied (D-9): project's last one, pasted/uploaded text, or none. */
export type PreviousMode = "project" | "paste" | "none";

/** Form state of the «дополнения к этой встрече» block; held by the upload page. */
export interface ContextDraft {
  projectId: string | null;
  meetingType: MeetingType | null;
  goal: string;
  agenda: string;
  notes: string;
  /** meeting additions only — never the project's own entries */
  participants: ParticipantValue[];
  glossary: TermValue[];
  previousMode: PreviousMode;
  previousText: string;
}

export const emptyDraft: ContextDraft = {
  projectId: null,
  meetingType: null,
  goal: "",
  agenda: "",
  notes: "",
  participants: [],
  glossary: [],
  previousMode: "project",
  previousText: "",
};

function hasPastedProtocol(d: ContextDraft): boolean {
  return d.previousMode === "paste" && d.previousText.trim() !== "";
}

/** True when the user filled nothing: the meeting then starts without a context PUT. */
export function isDraftEmpty(d: ContextDraft): boolean {
  return (
    d.projectId === null &&
    d.meetingType === null &&
    d.goal.trim() === "" &&
    d.agenda.trim() === "" &&
    d.notes.trim() === "" &&
    d.participants.length === 0 &&
    d.glossary.length === 0 &&
    !hasPastedProtocol(d)
  );
}

function orNull(raw: string): string | null {
  return raw.trim() === "" ? null : raw.trim();
}

/**
 * Body of PUT /api/meetings/:id/context. `lastProtocolMeetingId` is the meeting behind
 * the project's last protocol (null/undefined = the project has none).
 */
export function buildPutRequest(
  d: ContextDraft,
  lastProtocolMeetingId: string | null | undefined,
): MeetingContextPutRequest {
  let previous: PreviousProtocol = { source: "none" };
  if (hasPastedProtocol(d)) {
    previous = { source: "upload", text: d.previousText.trim() };
  } else if (
    d.previousMode === "project" &&
    d.projectId !== null &&
    lastProtocolMeetingId
  ) {
    previous = {
      source: "project",
      meeting_id: lastProtocolMeetingId,
      text: null,
    };
  }

  return {
    project_id: d.projectId,
    meeting_type: d.meetingType,
    goal: orNull(d.goal),
    agenda: orNull(d.agenda),
    participants: d.participants.map((p) => ({
      ...p,
      source: "meeting" as const,
      participant_id: null,
    })),
    glossary: d.glossary.map((g) => ({
      ...g,
      source: "meeting" as const,
      term_id: null,
    })),
    previous_protocol: previous,
    notes: orNull(d.notes),
  };
}

export function isProtocolTooLong(text: string): boolean {
  return text.length > PREVIOUS_PROTOCOL_MAX_CHARS;
}

/**
 * Estimate of how many names/terms compete for the ASR keyterm budget
 * (names + spelling variants + distinct organizations + terms flagged «для распознавания»).
 * Anything above ASR_KEYTERMS_MAX goes to the protocol prompt only (W01).
 */
export function countRecognitionTerms(
  project: ProjectDetailResponse | undefined,
  d: ContextDraft,
): number {
  const people = [...(project?.participants ?? []), ...d.participants];
  const orgs = new Set(
    people.map((p) => p.organization?.trim().toLowerCase()).filter(Boolean),
  );
  const names = people.reduce((n, p) => n + 1 + p.aliases.length, 0);
  const terms = [...(project?.glossary ?? []), ...d.glossary].filter(
    (g) => g.asr_keyterm,
  ).length;
  return names + orgs.size + terms;
}

export { ASR_KEYTERMS_MAX };
