import { z } from 'zod';

// FR-004 — projects, participants, glossary (contract v1; logic: WP-API-PROJECTS-01).
// Every route checks workspace membership; someone else's project → 404 NOT_FOUND.
//
//   GET    /api/projects?workspace_id=<uuid>                → ProjectListResponse
//   POST   /api/projects                    ProjectCreateRequest → 201 ProjectDetailResponse
//   GET    /api/projects/:projectId                         → ProjectDetailResponse
//   PATCH  /api/projects/:projectId         ProjectUpdateRequest → ProjectDetailResponse
//   DELETE /api/projects/:projectId                         → 204 (meetings keep, projectId → NULL)
//   POST   /api/projects/:projectId/participants   ParticipantInput → 201 ProjectParticipant
//   PATCH  /api/projects/:projectId/participants/:participantId  ParticipantUpdate → ProjectParticipant
//   DELETE /api/projects/:projectId/participants/:participantId  → 204
//   POST   /api/projects/:projectId/glossary       GlossaryTermInput → 201 GlossaryTerm
//   PATCH  /api/projects/:projectId/glossary/:termId  GlossaryTermUpdate → GlossaryTerm
//   DELETE /api/projects/:projectId/glossary/:termId  → 204
//   GET    /api/projects/:projectId/last-protocol             → LastProtocolResponse
//                                                             | 404 PREVIOUS_PROTOCOL_UNAVAILABLE
// «Добавить в проект» from the meeting context uses the same POST participants/glossary.

export const PROJECT_NAME_MAX = 200;
export const PROJECT_DESCRIPTION_MAX = 5_000;
export const PARTICIPANT_NAME_MAX = 200;
export const PARTICIPANT_ALIASES_MAX = 20;
export const GLOSSARY_TERM_MAX = 200;
export const GLOSSARY_VARIANTS_MAX = 20;
export const GLOSSARY_DEFINITION_MAX = 2_000;

/** D-10: which side of the deal a participant is on. */
export const ParticipantSide = z.enum(['OURS', 'CLIENT', 'CONTRACTOR', 'OTHER']);
export type ParticipantSide = z.infer<typeof ParticipantSide>;

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const ProjectParticipant = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /** spelling variants / nicknames (also ASR keyterms) */
  aliases: z.array(z.string()),
  role: z.string().nullable(),
  organization: z.string().nullable(),
  side: ParticipantSide,
});
export type ProjectParticipant = z.infer<typeof ProjectParticipant>;

export const ParticipantInput = z.object({
  name: shortText(PARTICIPANT_NAME_MAX),
  aliases: z.array(shortText(PARTICIPANT_NAME_MAX)).max(PARTICIPANT_ALIASES_MAX).default([]),
  role: shortText(PARTICIPANT_NAME_MAX).nullable().optional(),
  organization: shortText(PARTICIPANT_NAME_MAX).nullable().optional(),
  side: ParticipantSide.default('OTHER'),
});
export type ParticipantInput = z.input<typeof ParticipantInput>;

export const ParticipantUpdate = ParticipantInput.partial();
export type ParticipantUpdate = z.input<typeof ParticipantUpdate>;

export const GlossaryTerm = z.object({
  id: z.string().uuid(),
  term: z.string(),
  variants: z.array(z.string()),
  definition: z.string().nullable(),
  /** «для распознавания»: offered to ASR as a keyterm (Q-1, ASR_KEYTERMS_ENABLED) */
  asr_keyterm: z.boolean(),
});
export type GlossaryTerm = z.infer<typeof GlossaryTerm>;

export const GlossaryTermInput = z.object({
  term: shortText(GLOSSARY_TERM_MAX),
  variants: z.array(shortText(GLOSSARY_TERM_MAX)).max(GLOSSARY_VARIANTS_MAX).default([]),
  definition: shortText(GLOSSARY_DEFINITION_MAX).nullable().optional(),
  asr_keyterm: z.boolean().default(false),
});
export type GlossaryTermInput = z.input<typeof GlossaryTermInput>;

export const GlossaryTermUpdate = GlossaryTermInput.partial();
export type GlossaryTermUpdate = z.input<typeof GlossaryTermUpdate>;

export const ProjectSummary = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  meeting_count: z.number().int().min(0),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type ProjectSummary = z.infer<typeof ProjectSummary>;

export const ProjectListQuery = z.object({
  workspace_id: z.string().uuid(),
});
export type ProjectListQuery = z.infer<typeof ProjectListQuery>;

export const ProjectListResponse = z.object({
  items: z.array(ProjectSummary),
});
export type ProjectListResponse = z.infer<typeof ProjectListResponse>;

export const ProjectDetailResponse = z.object({
  project: ProjectSummary,
  participants: z.array(ProjectParticipant),
  glossary: z.array(GlossaryTerm),
});
export type ProjectDetailResponse = z.infer<typeof ProjectDetailResponse>;

export const ProjectCreateRequest = z.object({
  workspace_id: z.string().uuid(),
  name: shortText(PROJECT_NAME_MAX),
  description: shortText(PROJECT_DESCRIPTION_MAX).nullable().optional(),
});
export type ProjectCreateRequest = z.infer<typeof ProjectCreateRequest>;

export const ProjectUpdateRequest = z
  .object({
    name: shortText(PROJECT_NAME_MAX),
    description: shortText(PROJECT_DESCRIPTION_MAX).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' });
export type ProjectUpdateRequest = z.infer<typeof ProjectUpdateRequest>;

/** Current version of the newest protocol among the project's meetings. */
export const LastProtocolResponse = z.object({
  meeting_id: z.string().uuid(),
  meeting_title: z.string(),
  version_n: z.number().int().min(1),
  markdown: z.string(),
  created_at: z.string().datetime(),
});
export type LastProtocolResponse = z.infer<typeof LastProtocolResponse>;
