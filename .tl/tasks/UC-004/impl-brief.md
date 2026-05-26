# UC-004 — Backend Implementation Brief

> Source: Neo4j SA layer (UC-004, RC-UC-004, RQ-034/035/036). FR-001. Depends on TECH-026, UC-200-BE, UC-300-BE.

## 1. Models
- No new entity. Uses `attempt_count:Int` added to TranscriptionJob (ent-003) and ProtocolGenerationJob (ent-005) by TECH-026.

## 2. Service layer (mod-common)
- `retryMeetingProcessing(meetingId, ownerId)`:
  1. Load Meeting (scope=own). 404 if absent, 403 if not owner.
  2. Guard: Meeting.status must be FAILED, else 409 MEETING_NOT_FAILED (RQ-036).
  3. Find the most recent FAILED job across TranscriptionJob + ProtocolGenerationJob → determines stage (RQ-034).
  4. Idempotency guard: if a job for (meetingId, stage) is already QUEUED/IN_PROGRESS → no-op / 409 RETRY_ALREADY_IN_FLIGHT (RQ-035).
  5. One Prisma transaction: reset job (status=QUEUED, attempt_count=0, error_msg=null) + transition Meeting.status → TRANSCRIBING | PROTOCOL_GENERATING (RQ-034, BRQ-008).
  6. After commit: enqueue to BullMQ (idempotent jobId = meetingId+stage) + publish SSE meeting.status on `meeting:<id>` (RQ-035).

## 3. API controller (api/)
- `POST /api/meetings/:id/retry` (Fastify + zod). AUTHOR-guarded. Returns updated meeting. See api-contract.md.

## 4. Validation / edge cases
- Reconcile legacy `Meeting.status='ERROR'` → spec `FAILED` on this path (CLAUDE.md drift note; or separate L1 fix).
- Enqueue is an after-commit side effect, never inside the DB transaction (RC-UC-004).

## 5. Integration points
- Re-enqueued job is consumed by UC-200 (transcription) / UC-300 (protocol) workers, which now honour transient-vs-permanent FAILED-write semantics (FR-001 refinements).
