# UC-300 — Backend Implementation Brief

**UC:** Generate protocol pipeline

## File plan

- `worker/src/jobs/uc-300.ts` — Worker handler
- `worker/src/jobs/uc-300.test.ts` — Unit + integration tests

## Steps

1. Worker dequeues; UPDATE ProtocolGenerationJob SET status='IN_PROGRESS', started_at=now WHERE id=:id AND status='QUEUED'.
2. Load Transcript via transcript_id; read language.
3. Select prompt template per Transcript.language (RU/EN); record prompt_template_version on job (RQ-022).
4. Submit transcript + selected prompt to ILlmProvider.generate (TECH-011).
5. Parse LLM response into Markdown.
6. Validate four required sections are present: Participants, Discussion Topics, Decisions, Action Items (RQ-023). Missing -> FAILED path.
7. Insert Protocol(meeting_id, markdown_content, version=1, edit_count=0, generated_at=now) (RQ-025).
8. Transition Meeting.status -> PROTOCOL_READY (BRQ-008).
9. Transition ProtocolGenerationJob.status -> COMPLETED, completed_at=now (RQ-021).
10. Publish SSE 'meeting.status' event.
11. ALT failure path: catch any thrown error or section-missing -> mark job FAILED with descriptive error_reason; Meeting.status -> FAILED; publish SSE; do NOT re-enqueue (RQ-026).

## Cross-cutting

- All Prisma writes that touch Meeting.status MUST go through a single transaction with the relevant child write (BRQ-008 mirror).
- All errors throw `AppError(code, http, message)` — never return ad-hoc objects.
- Each RQ ID referenced by a code comment on the line that satisfies it.
- Worker handlers MUST be idempotent under BullMQ retry semantics; check job.status before mutating.
- Terminal-state writes (COMPLETED / FAILED) require a guard `WHERE status='IN_PROGRESS'` (BRQ-009).
