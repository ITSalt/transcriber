# UC-200 — Acceptance Criteria

**UC:** Process transcription pipeline

## Criteria

- [ ] GIVEN a QUEUED TranscriptionJob, WHEN a worker picks it up, THEN job.status -> IN_PROGRESS and started_at is set.
- [ ] GIVEN ASR succeeds, THEN Transcript is persisted, speakers resolved per BRQ-021, Meeting.status -> TRANSCRIPT_READY, job.status -> COMPLETED, and a ProtocolGenerationJob is auto-created (BRQ-007).
- [ ] GIVEN ASR fails, THEN job.status -> FAILED with non-null error_reason (BRQ-010), and Meeting.status -> FAILED; terminal states are immutable (BRQ-009).

## Tied to requirements

- **RQ-014** — TranscriptionJob lifecycle: QUEUED -> IN_PROGRESS -> {COMPLETED, FAILED}. Terminal states immutable (BRQ-009).
- **RQ-015** — On ANY failure (storage fetch, audio extraction, ASR call, response parsing) -> job.status=FAILED with non-null error_reason; Meeting.status -> FAILED (BRQ-008/010).
- **RQ-016** — On successful completion of TranscriptionJob, auto-create exactly one ProtocolGenerationJob (status=QUEUED, transcript_id, prompt_template_version=current) per BRQ-007.
- **RQ-017** — Speaker name resolution MUST attempt to map anonymous diarization labels to real names via self-introductions / addressed names in the transcript. Confident matches substitute across full_text and populate speaker_map. Unresolved labels remain 'Speaker N' (BRQ-021).
- **RQ-018** — Language: if Meeting.language is null, ASR detects and writes Transcript.language; Meeting.language stays null. If set, it is passed as hint and Transcript.language SHOULD match (BRQ-005).
- **NFR-002** — Async job-based execution; no UI blocking.
- **NFR-003** — No processing-time SLA at MVP.
- **NFR-004** — RU + EN throughout.
- **NFR-008** — Failures surfaced with human-readable error_reason; terminal jobs immutable.

## Sign-off

- [ ] BE tests in `test-spec.md` all pass.
- [ ] `/nacl-tl-review` BE and FE both APPROVED.
