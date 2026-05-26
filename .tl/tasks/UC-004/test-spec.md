# UC-004 — Backend Test Spec: Retry failed meeting processing

> Source: Neo4j SA layer (UC-004 system steps, RQ-034/035/036, RC-UC-004). FR-001.

## Scenarios

### TS-BE-1 — Retry transcription failure (RQ-034)
- Given a Meeting in FAILED whose most-recent FAILED job is a TranscriptionJob.
- When POST /api/meetings/:id/retry.
- Then the TranscriptionJob is reset (status=QUEUED, attempt_count=0, error_msg=null), Meeting.status → TRANSCRIBING, all in one transaction; job enqueued to BullMQ; SSE meeting.status published.

### TS-BE-2 — Retry protocol failure (RQ-034)
- Given a Meeting in FAILED whose most-recent FAILED job is a ProtocolGenerationJob.
- Then that job is reset and Meeting.status → PROTOCOL_GENERATING.

### TS-BE-3 — Idempotent on already-queued (RQ-035)
- Given a job for meeting+stage already QUEUED or IN_PROGRESS.
- When retry is triggered.
- Then NO duplicate job is created; response is a safe no-op / 409 RETRY_ALREADY_IN_FLIGHT; no extra enqueue.

### TS-BE-4 — Reject when not FAILED (RQ-036)
- Given Meeting.status in {TRANSCRIBING, PROTOCOL_GENERATING, DONE, ...} (not FAILED).
- Then 409 MEETING_NOT_FAILED and NO state change (verify job + meeting unchanged).

### TS-BE-5 — Authorization (SR-01 scope=own)
- A non-owning user → 403 FORBIDDEN. Unknown meeting → 404.

### TS-BE-6 — Transaction atomicity (RC-UC-004)
- If the enqueue step would fail, the DB transaction (job reset + meeting transition) must already be committed; enqueue is an after-commit side effect, not part of the transaction.

### TS-BE-7 — Concurrency / double submit (RC-UC-004)
- Two concurrent retries for the same meeting+stage → exactly one effective re-enqueue.

## Notes
- `attempt_count` column provided by TECH-026.
- Reconcile any `Meeting.status='ERROR'` legacy value to spec `FAILED` on this path.
