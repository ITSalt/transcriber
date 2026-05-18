# UC-200 — Backend Implementation Brief

**UC:** Process transcription pipeline

## File plan

- `worker/src/jobs/uc-200.ts` — Worker handler
- `worker/src/jobs/uc-200.test.ts` — Unit + integration tests

## Steps

1. Worker dequeues; UPDATE TranscriptionJob SET status='IN_PROGRESS', started_at=now WHERE id=:id AND status='QUEUED' (optimistic concurrency).
2. Fetch Recording bytes from S3 via IStorage.getObjectStream(recording.storage_path).
3. extractAudio + probeContainer (TECH-009); populate Recording.duration_sec.
4. Submit audio + Meeting.language hint to IAsrProvider.transcribe (TECH-010).
5. On ASR success: receive segments + speaker labels + detectedLanguage.
6. Resolve speakers per RQ-017: parse full_text for self-introductions / addressed names; build speaker_map; substitute resolved labels in full_text; unresolved remain 'Speaker N' mapping to null.
7. Insert Transcript(meeting_id, full_text, segments_count, speakers_count, language=detected|hint, speaker_map, created_at=now).
8. Transition Meeting.status -> TRANSCRIPT_READY (BRQ-008).
9. Transition TranscriptionJob.status -> COMPLETED, completed_at=now.
10. Auto-create ProtocolGenerationJob(status=QUEUED, transcript_id, meeting_id, prompt_template_version=current) and enqueue (RQ-016).
11. Publish SSE 'meeting.status' event for TRANSCRIPT_READY.
12. ALT failure path: any thrown error -> mark job FAILED with error_reason=err.message; set Meeting.status=FAILED; publish SSE; do NOT re-enqueue (RQ-014, RQ-015).

## Cross-cutting

- All Prisma writes that touch Meeting.status MUST go through a single transaction with the relevant child write (BRQ-008 mirror).
- All errors throw `AppError(code, http, message)` — never return ad-hoc objects.
- Each RQ ID referenced by a code comment on the line that satisfies it.
- Worker handlers MUST be idempotent under BullMQ retry semantics; check job.status before mutating.
- Terminal-state writes (COMPLETED / FAILED) require a guard `WHERE status='IN_PROGRESS'` (BRQ-009).
