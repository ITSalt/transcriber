# UC-300 — Acceptance Criteria

**UC:** Generate protocol pipeline

## Criteria

- [ ] GIVEN a Transcript is COMPLETED, THEN a ProtocolGenerationJob is auto-created per BRQ-007 with status=QUEUED.
- [ ] GIVEN a worker runs the job, THEN it loads the transcript, selects the prompt template by language (BRQ-013), calls the LLM, parses the response, and validates required sections (BRQ-011).
- [ ] GIVEN LLM succeeds AND all required sections are present, THEN Protocol is persisted (markdown, version=1, edit_count=0), Meeting.status -> PROTOCOL_READY, job.status -> COMPLETED.
- [ ] GIVEN LLM fails OR response is invalid, THEN job.status -> FAILED with error_reason, Meeting.status -> FAILED.

## Tied to requirements

- **RQ-021** — ProtocolGenerationJob lifecycle: QUEUED -> IN_PROGRESS -> {COMPLETED, FAILED}. Terminal immutable (BRQ-009).
- **RQ-022** — LLM prompt template selected by Transcript.language (BRQ-013); resulting protocol language MUST match transcript language. Template version recorded on job.
- **RQ-023** — Persisted Protocol MUST contain Participants, Discussion Topics, Decisions, Action Items (BRQ-011). Missing section -> job FAILED.
- **RQ-024** — Action items SHOULD include assignee/deadline when stated (BRQ-012). Best-effort by LLM.
- **RQ-025** — Initial Protocol on success: version=1, edit_count=0, generated_at=now. Meeting.status -> PROTOCOL_READY (BRQ-008/014/015).
- **RQ-026** — On ANY failure (LLM error, parse error, missing required sections) -> job FAILED with error_reason; Meeting FAILED (BRQ-008/010).
- **NFR-002** — Async; non-blocking UI.
- **NFR-003** — No SLA at MVP.
- **NFR-004** — RU + EN.
- **NFR-006** — Markdown canonical; PDF transient (re-rendered).
- **NFR-008** — Failures surfaced; terminal immutable.

## Sign-off

- [ ] BE tests in `test-spec.md` all pass.
- [ ] `/nacl-tl-review` BE and FE both APPROVED.
