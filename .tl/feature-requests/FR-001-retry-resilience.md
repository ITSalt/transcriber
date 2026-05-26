# Feature Request: FR-001 Worker Job Retry Resilience

## Metadata
| Field | Value |
|-------|-------|
| Created | 2026-05-26 |
| Status | spec-complete |
| Source | /nacl-sa-feature "retry resilience: transient ASR/LLM failures permanently brick a meeting (no BullMQ retry; FAILED-write + idempotency guard no-op any re-attempt; RQ-026 said 'do NOT re-enqueue'). Spec retry-with-backoff AND a user-facing regenerate action. Plus a Redis db-index TECH ticket." |
| Impact method | Neo4j graph traversal (fulltext `sa_impact_analysis` + runtime-contract trace) |
| Scope decisions | Regenerate UC in mod-common (covers both stages); auto-retry folded in as spec refinement |

## Feature Description
Today a transient ASR/LLM failure permanently bricks a meeting. There is no working retry path: the worker runs with BullMQ `attempts=1`, and even with retries configured the failure handler writes `status=FAILED` to Postgres first, so the idempotency guard (`status===FAILED → return`) no-ops any re-attempt. This FR (a) **refines** the worker UCs so a *transient* failure with attempts remaining re-throws **without** writing FAILED — letting bounded auto retry-with-backoff (already specified in RC-UC-200/RC-UC-300) actually work — and (b) **adds** a user-facing "Retry processing" action (UC-004) so an AUTHOR can recover a meeting stuck in FAILED, re-enqueuing whichever stage failed.

## Impact Summary
| Area | Change | Details |
|------|--------|---------|
| Architecture | no change | no new module |
| Domain | ~2 entities MODIFIED | `attempt_count:Int` added to TranscriptionJob (ent-003 → `TranscriptionJob-A08`) and ProtocolGenerationJob (ent-005 → `ProtocolGenerationJob-A09`) |
| Use Cases | +1 NEW | UC-004 "Retry failed meeting processing" (mod-common, AUTHOR, has_ui) |
| Use Cases | ~2 MODIFIED | UC-200, UC-300 — failure path refined (transient vs terminal) |
| Runtime | +1 NEW, ~2 MODIFIED | RC-UC-004 (new); RC-UC-200 & RC-UC-300 retry_semantics refined with FAILED-write timing |
| Requirements | +3 NEW, ~2 MODIFIED | NEW: RQ-034/035/036 (UC-004); MODIFIED: RQ-015, RQ-026 (permanent-OR-exhaustion semantics) |
| Roles | ~1 MODIFIED | AUTHOR (SR-01) gains `RU`/scope=own on TranscriptionJob + ProtocolGenerationJob (re-trigger) |
| UI: Components | +1 NEW | CMP-RetryProcessing (`input`, AUTHOR) USED_IN FORM-MeetingDetail; reuses CMP-ConfirmDialog |
| UI: Forms | reuse | UC-004 USES_FORM FORM-MeetingDetail (no new FormFields) |

## Graph Impact Trace
- Modules affected: `mod-common` (UC-004 added), `mod-transcription` (UC-200), `mod-protocol` (UC-300)
- Entities affected: `ent-003` (TranscriptionJob), `ent-005` (ProtocolGenerationJob)
- UCs affected: UC-004 (new), UC-200 (modified), UC-300 (modified)
- Runtime contracts: RC-UC-004 (new), RC-UC-200 / RC-UC-300 (modified)
- Impact query keywords: `retry backoff regenerate failure re-enqueue transient permanent attempts job stuck error`

## New UCs to Plan
- **UC-004 — Retry failed meeting processing** (mod-common, AUTHOR, has_ui). On a Meeting in `FAILED`, AUTHOR triggers retry; System identifies the most recent FAILED job, re-enqueues that stage (status=QUEUED, attempt_count=0, error_msg cleared) and moves Meeting.status back to the corresponding in-progress state. Idempotent on meetingId+stage. Offered only when Meeting.status=FAILED (else 409). Requirements: RQ-034/035/036. RuntimeContract: RC-UC-004.

## Modified UCs to Re-plan
- **UC-200 (Process transcription pipeline)** — RQ-015 refined: write FAILED only on a permanent error (storage-not-found, non-retriable ASR) or after retry exhaustion; transient (429/5xx) re-throws WITHOUT writing FAILED. RC-UC-200 retry_semantics extended with FAILED-write timing. Code must add `attempt_count` handling and stop treating a non-final FAILED as terminal.
- **UC-300 (Generate protocol pipeline)** — RQ-026 refined symmetrically (permanent = parse/missing-section/401/400/404). RC-UC-300 extended. Resolves the prior contradiction where RQ-026/task docs said "do NOT re-enqueue" while RC-UC-300 specified retry-on-429/5xx.

## New TECH Tasks (recommended → /nacl-tl-plan)
- **TECH-025 — Redis URL db-index dropped by parseRedisUrl().** `worker/src/queues.ts:parseRedisUrl()` (and `api/src/queue.ts`) drop the URL path db-index, so the worker connects to Redis DB 0 even when `REDIS_URL` ends in `/1`. Harmless today (producer + consumer agree), but a latent foot-gun once envs diverge. Parse and pass `db` through to the `ConnectionOptions`. Add a unit test (`queues.test.ts` already covers parseRedisUrl). Pure infra; no spec/graph change.

## Dependencies
- UC-004 depends on UC-200-BE and UC-300-BE (re-enqueues their jobs) and on UC-002-FE (Meeting detail page hosts the action).
- The UC-200/UC-300 refinements depend on the `attempt_count` domain migration (Prisma) landing first.
- TECH-025 is independent.

## Implementation notes (for /nacl-tl-plan + dev)
- **Code drift to fix alongside:** the worker uses `Meeting.status='ERROR'`, but the spec enum `MeetingStatus` uses **`FAILED`** (order 7). The retry path must read/write the spec value; reconcile the `ERROR`→`FAILED` naming during implementation (or raise a separate L1 fix).
- **The core code change** (transcription.ts:185-188 guard + :332-343 failure handler; mirror in protocol-generation.ts): on catch, if the error is transient AND `job.attemptsMade < maxAttempts`, re-throw WITHOUT the FAILED transaction; only write FAILED on permanent error or final attempt. Configure BullMQ `attempts:3` + exponential backoff (already in RC-UC-200/300).
- A regression test already exists at `worker/src/jobs/transcription.regression.test.ts` (uncommitted) — wire it to the new behaviour.

## SA Artifacts Created/Modified
- **NEW** UseCase `UC-004` (+ CONTAINS_UC from mod-common, ACTOR→SR-01, USES_FORM→FORM-MeetingDetail)
- **NEW** ActivityStep `UC-004-AS01..AS06`
- **NEW** Requirement `RQ-034`, `RQ-035`, `RQ-036` (HAS_REQUIREMENT from UC-004)
- **NEW** RuntimeContract `RC-UC-004` (HAS_RUNTIME_CONTRACT from UC-004)
- **NEW** Component `CMP-RetryProcessing` (USED_IN FORM-MeetingDetail)
- **NEW** DomainAttribute `TranscriptionJob-A08`, `ProtocolGenerationJob-A09` (attempt_count)
- **MODIFIED** Requirement `RQ-015`, `RQ-026` (description reconciled)
- **MODIFIED** RuntimeContract `RC-UC-200`, `RC-UC-300` (retry_semantics)
- **MODIFIED** SystemRole `SR-01` permissions (HAS_PERMISSION crud RU on ent-003/ent-005)

## Skills Invoked
- nacl-sa-feature (this run) — performed domain MODIFY, roles MODIFY, UC create, UC modify, UI component, runtime-contract create/modify, requirement create/modify directly via graph writes (sub-skills not separately invoked).
