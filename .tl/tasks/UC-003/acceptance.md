# UC-003 — Acceptance Criteria

**UC:** Delete meeting

## Criteria

- [ ] GIVEN any Meeting, WHEN I confirm deletion, THEN the Meeting, its Recording (storage object removed), Transcript, Protocol, and all jobs are deleted.
- [ ] GIVEN deletion succeeds, THEN I am returned to the catalog (UC-001) with a confirmation toast.
- [ ] WHILE a job is IN_PROGRESS, deletion shows confirmation that the in-flight job will be marked FAILED.

## Tied to requirements

- **RQ-003** — Ownership scope (deferred per NFR-007).
- **RQ-006** — Meeting deletion MUST cascade-remove Protocol, ProtocolGenerationJob, Transcript, TranscriptionJob, Recording (incl. storage object in EXT-04), and the Meeting itself.
- **RQ-007** — Deletion while a job is IN_PROGRESS MUST require confirmation and MUST mark the in-flight job FAILED with error_reason='deleted by user'. Already-terminal jobs preserve BRQ-009 immutability.
- **NFR-007** — MVP no-auth.

## Sign-off

- [ ] BE tests in `test-spec.md` all pass.
- [ ] FE tests in `test-spec-fe.md` all pass.
- [ ] `/nacl-tl-qa UC-003` end-to-end run is green.
- [ ] `/nacl-tl-review` BE and FE both APPROVED.
