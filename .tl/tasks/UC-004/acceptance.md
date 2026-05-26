# UC-004 — Acceptance Criteria: Retry failed meeting processing

> Source: Neo4j SA layer (UC-004, RQ-034/035/036, RC-UC-004). FeatureRequest FR-001.

## Preconditions
- Meeting exists and is owned by the AUTHOR.
- Meeting.status = FAILED with a most-recent FAILED job (TranscriptionJob or ProtocolGenerationJob).

## Acceptance criteria

- [ ] **AC-1 (RQ-034):** Triggering retry on a FAILED meeting identifies the most recent FAILED job, resets it (status=QUEUED, attempt_count=0, error_msg=null), and transitions Meeting.status FAILED → TRANSCRIBING (transcription failure) or PROTOCOL_GENERATING (protocol failure), all in one Prisma transaction.
- [ ] **AC-2 (RQ-035):** Retry is idempotent — if a job for meeting+stage is already QUEUED/IN_PROGRESS, no duplicate job is created (idempotency key = meetingId + stage).
- [ ] **AC-3 (RQ-035):** After commit, the job is enqueued to BullMQ and an SSE `meeting.status` event is published on `meeting:<id>`.
- [ ] **AC-4 (RQ-036):** Retry is rejected with a 409-class error and NO state change when Meeting.status != FAILED.
- [ ] **AC-5 (RQ-036, FE):** The "Retry processing" action is shown only when status=FAILED; hidden otherwise.
- [ ] **AC-6 (authz):** Only the owning AUTHOR (SR-01, scope=own) may invoke retry; others get 403.
- [ ] **AC-7 (RC-UC-004):** Concurrent/double-click retry no-ops via the idempotency guard rather than racing the worker.

## Postconditions
- The failed stage is re-enqueued; Meeting resumes its in-progress lifecycle (UC-200 / UC-300).
