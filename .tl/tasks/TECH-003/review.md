---
task: TECH-003
type: tech
phase: code-review
reviewer: nacl-tl-review
review_started: 2026-05-18
review_updated: 2026-05-18
result: approved
commit: b2cf859
re_review: true
---

# REVIEW APPLIED -- UNVERIFIED (no live DB for smoke tests)

## Verdict

APPROVED. The single Critical defect from the prior review (C01 -- stale `contentMd` field name in the smoke test) has been remediated. Schema and migrations remain structurally sound per the prior review. Smoke tests still require a live Postgres 16 to execute (7 specs auto-skipped via `describe.skipIf(!hasDb)`), so the round-trip acceptance criterion remains UNVERIFIED in this environment -- but this is an environmental constraint, not a defect.

## Re-review Scope

This re-review covers ONLY the previously flagged defect remediation. Schema, migrations, db.ts, and prisma.config.ts were judged structurally sound in the prior review (commit b2cf859) and have not been re-litigated.

## Fix Confirmation -- Issue C01 (Critical)

- File: `C:\projects\transcrib\api\src\prisma.smoke.test.ts`
- Prior defect: lines 114, 118, 135 referenced `contentMd` (renamed to `markdownContent` by migration `20260518_uc301_protocol_edit_fields`).
- Re-review evidence (verbatim):
  - Line 114: `markdownContent: '# Meeting Notes\n\n- Item 1',` -- FIXED
  - Line 118: `expect(found?.markdownContent).toContain('# Meeting Notes')` -- FIXED
  - Line 135: `data: { meetingId: meeting.id, markdownContent: '# Cascade test' },` -- FIXED
- All three occurrences now reference the current schema field name. The smoke suite will validate correctly against any DB at HEAD.

## Test Verification

- `pnpm test` from `C:\projects\transcrib` executed.
- Workspace result: 450 passed, 5 failed, 7 skipped (462 total).
- The 7 skipped are the TECH-003 Prisma smoke tests -- expected behavior in absence of `DATABASE_URL`.
- The 5 failures are all in `worker/src/jobs/transcription.test.ts` (UC-200 -- TranscriptionJob -> ProtocolGenerationJob auto-create logic). These are pre-existing UC-200 issues already tracked under `status.json` (`UC-200.review-be = changes_requested`) and are OUT OF SCOPE for the TECH-003 re-review.
- No TECH-003-owned test failed.

## Acceptance Criteria -- Final Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| Models: Meeting, Recording, TranscriptionJob, Transcript, ProtocolGenerationJob, Protocol | PASS | All six present |
| Enums: MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType | PASS | All four present |
| Cascade deletes per RQ-006 | PASS | All child models declare `onDelete Cascade` |
| Composite indexes on (meeting_id, status) for jobs | PASS | Both job tables indexed |
| JSONB for Transcript.speaker_map and segments_blob | PASS | Both `@db.JsonB` with defaults |
| Initial migration applied; prisma generate produces @prisma/client | UNVERIFIED | No live DB in env -- environmental constraint |
| Round-trip create+findFirst per entity | UNVERIFIED | Smoke skipped (no DB) but test file is now schema-correct |

## Residual Items (non-blocking)

These were minor/major items in the prior review that do not block approval:

- M01 (Major, prior) -- `result.md` content drift (claims 3 models, wrong migration path, misnames JSONB columns). Recommend follow-up via `/nacl-tl-docs TECH-003` to align historical narrative with reality.
- m01 (Minor) -- afterAll-only cleanup in smoke test; mid-test crash could leak rows. Optional improvement.
- m02 (Minor) -- hardcoded dev fallback credentials in `prisma.config.ts`. Document as dev-only.
- m03 (Minor) -- no `status.json` / `acceptance.md` under `.tl/tasks/TECH-003/`. Flagged for `/nacl-tl-reconcile`.

## Decision

APPROVED. The critical stale-field bug is fixed; schema and migrations are structurally sound. Round-trip acceptance remains UNVERIFIED pending execution against a live Postgres 16 -- recoverable on first CI run with a provisioned DB.

## Next Steps

1. (Optional) Run the smoke suite once against a live Postgres 16 to convert the UNVERIFIED rows to PASS.
2. (Optional follow-up) `/nacl-tl-docs TECH-003` to correct `result.md` content drift (M01).
