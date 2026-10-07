import { z } from 'zod';
import { ParticipantSide, PARTICIPANT_NAME_MAX, PARTICIPANT_ALIASES_MAX, GLOSSARY_TERM_MAX, GLOSSARY_VARIANTS_MAX, GLOSSARY_DEFINITION_MAX } from './project.js';

// FR-004 — meeting context and deferred start (contract v1; logic: WP-API-PROJECTS-01).
//
//   POST /api/uploads/complete  { …, defer_start: true }  → meeting in AWAITING_START (uc100.ts)
//   PUT  /api/meetings/:id/context   MeetingContextPutRequest → MeetingContextResponse
//        only while AWAITING_START (else 409 CONTEXT_FROZEN); stores a DRAFT
//   GET  /api/meetings/:id/context                      → MeetingContextResponse | 404 NOT_FOUND
//        draft before start, frozen snapshot after (task card «использованный контекст»)
//   POST /api/meetings/:id/start                        → StartMeetingResponse
//        only from AWAITING_START (else 409 MEETING_NOT_AWAITING_START); freezes the
//        snapshot = project card (source 'project') + meeting additions (source 'meeting')
//        + previous protocol text, sets snapshot_hash and Meeting.projectId, then enqueues
//        transcription exactly like finalizeUpload ({transcription_job_id, speaker_count}).
//        The context is optional: start without a PUT is valid.
// Later project edits never change a frozen snapshot.

/** D-10 */
export const MeetingType = z.enum(['NEGOTIATION', 'STATUS', 'PLANNING', 'INTERVIEW', 'OTHER']);
export type MeetingType = z.infer<typeof MeetingType>;

export const PREVIOUS_PROTOCOL_MAX_CHARS = 200_000;
export const CONTEXT_GOAL_MAX = 2_000;
export const CONTEXT_AGENDA_MAX = 10_000;
export const CONTEXT_NOTES_MAX = 20_000;
export const CONTEXT_PARTICIPANTS_MAX = 100;
export const CONTEXT_GLOSSARY_MAX = 300;
/** W01: ASR keyterm budget — names/variants first, then organizations, then asr_keyterm terms. */
export const ASR_KEYTERMS_MAX = 50;
export const ASR_KEYTERMS_MAX_TOKENS = 450;

/** Where an entry of a context snapshot came from. */
export const ContextEntrySource = z.enum(['project', 'meeting']);
export type ContextEntrySource = z.infer<typeof ContextEntrySource>;

const shortText = (max: number) => z.string().trim().min(1).max(max);

/** One element of MeetingContext.participants (JSONB). */
export const ContextParticipant = z.object({
  name: shortText(PARTICIPANT_NAME_MAX),
  aliases: z.array(shortText(PARTICIPANT_NAME_MAX)).max(PARTICIPANT_ALIASES_MAX).default([]),
  role: shortText(PARTICIPANT_NAME_MAX).nullable().default(null),
  organization: shortText(PARTICIPANT_NAME_MAX).nullable().default(null),
  side: ParticipantSide.default('OTHER'),
  source: ContextEntrySource.default('meeting'),
  /** id of the ProjectParticipant when source = 'project' */
  participant_id: z.string().uuid().nullable().default(null),
});
export type ContextParticipant = z.infer<typeof ContextParticipant>;

/** One element of MeetingContext.glossary (JSONB). */
export const ContextGlossaryTerm = z.object({
  term: shortText(GLOSSARY_TERM_MAX),
  variants: z.array(shortText(GLOSSARY_TERM_MAX)).max(GLOSSARY_VARIANTS_MAX).default([]),
  definition: shortText(GLOSSARY_DEFINITION_MAX).nullable().default(null),
  asr_keyterm: z.boolean().default(false),
  source: ContextEntrySource.default('meeting'),
  /** id of the GlossaryTerm when source = 'project' */
  term_id: z.string().uuid().nullable().default(null),
});
export type ContextGlossaryTerm = z.infer<typeof ContextGlossaryTerm>;

/**
 * MeetingContext.previousProtocol (JSONB).
 * project: the project's last protocol (text filled in at /start);
 * upload: text pasted or read from a file by the browser (≤ 200 000 chars); none.
 */
export const PreviousProtocol = z.discriminatedUnion('source', [
  z.object({ source: z.literal('none') }),
  z.object({
    source: z.literal('project'),
    meeting_id: z.string().uuid().nullable().default(null),
    text: z.string().max(PREVIOUS_PROTOCOL_MAX_CHARS).nullable().default(null),
  }),
  z.object({
    source: z.literal('upload'),
    text: z.string().trim().min(1).max(PREVIOUS_PROTOCOL_MAX_CHARS),
  }),
]);
export type PreviousProtocol = z.infer<typeof PreviousProtocol>;

/** Body of PUT /api/meetings/:id/context. participants/glossary = meeting ADDITIONS only. */
export const MeetingContextPutRequest = z.object({
  project_id: z.string().uuid().nullable().default(null),
  meeting_type: MeetingType.nullable().default(null),
  goal: shortText(CONTEXT_GOAL_MAX).nullable().default(null),
  agenda: shortText(CONTEXT_AGENDA_MAX).nullable().default(null),
  participants: z.array(ContextParticipant.extend({ source: z.literal('meeting').default('meeting') }))
    .max(CONTEXT_PARTICIPANTS_MAX).default([]),
  glossary: z.array(ContextGlossaryTerm.extend({ source: z.literal('meeting').default('meeting') }))
    .max(CONTEXT_GLOSSARY_MAX).default([]),
  previous_protocol: PreviousProtocol.default({ source: 'none' }),
  notes: shortText(CONTEXT_NOTES_MAX).nullable().default(null),
});
export type MeetingContextPutRequest = z.input<typeof MeetingContextPutRequest>;
export type MeetingContextPut = z.output<typeof MeetingContextPutRequest>;

/** Context as stored (draft or frozen snapshot) and as read by the worker. */
export const MeetingContextSnapshot = z.object({
  meeting_type: MeetingType.nullable(),
  goal: z.string().nullable(),
  agenda: z.string().nullable(),
  participants: z.array(ContextParticipant),
  glossary: z.array(ContextGlossaryTerm),
  previous_protocol: PreviousProtocol,
  notes: z.string().nullable(),
});
export type MeetingContextSnapshot = z.infer<typeof MeetingContextSnapshot>;

export const MeetingContextResponse = MeetingContextSnapshot.extend({
  meeting_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  /** null while draft; set at /start */
  snapshot_hash: z.string().nullable(),
  frozen: z.boolean(),
  updated_at: z.string().datetime(),
});
export type MeetingContextResponse = z.infer<typeof MeetingContextResponse>;

export const StartMeetingResponse = z.object({
  meeting_id: z.string().uuid(),
  status: z.literal('TRANSCRIBING'),
  snapshot_hash: z.string().nullable(),
});
export type StartMeetingResponse = z.infer<typeof StartMeetingResponse>;

/**
 * Canonical JSON (sorted keys, no whitespace) of a snapshot — snapshot_hash is
 * sha256(canonicalSnapshotJson(snapshot)) in hex. Shared so api and worker agree.
 */
export function canonicalSnapshotJson(snapshot: MeetingContextSnapshot): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(MeetingContextSnapshot.parse(snapshot)));
}
