# UC-100 — Acceptance Criteria

**UC:** Upload meeting video

## Criteria

- [ ] GIVEN a valid MP4/MKV/MOV file <= 500 MB (BRQ-001, BRQ-002), WHEN I upload, THEN the system accepts, creates Meeting + Recording + TranscriptionJob, and shows status UPLOADING -> TRANSCRIBING.
- [ ] GIVEN a file > 500 MB or wrong MIME, WHEN I attempt upload, THEN the system rejects before storage with a clear error.
- [ ] GIVEN a corrupt file (BRQ-003), WHEN validation fails, THEN the system rejects with a user-facing error.
- [ ] I can choose RU or EN as the language hint; leaving it blank means auto-detect (BRQ-005).

## Tied to requirements

- **RQ-008** — Reject size_bytes > 524,288,000 (500 MB) BEFORE any storage upload begins.
- **RQ-009** — Accept exactly {video/mp4, video/x-matroska, video/quicktime}; reject others with clear user-facing error.
- **RQ-010** — Verify container integrity at upload acceptance (probe header / short sample). Corrupt files rejected before Recording is persisted (BRQ-003).
- **RQ-011** — On successful upload completion, atomically: (1) finalize Recording metadata; (2) transition Meeting.status UPLOADING -> TRANSCRIBING (BRQ-008); (3) create exactly one TranscriptionJob with status=QUEUED per Recording (BRQ-006).
- **RQ-012** — Language selector accepts RU, EN, or blank. Blank -> Meeting.language stays null; ASR auto-detects per BRQ-005.
- **RQ-013** — Meeting.title defaults to Recording.filename (without extension) when AUTHOR leaves the field blank.
- **NFR-001** — Upload pipeline accepts up to 500 MB via chunked transfer without timeout.
- **NFR-002** — Transcription/protocol run asynchronously; UI surfaces job progress without blocking.
- **NFR-004** — Support RU and EN throughout (UI, ASR hint, prompts, errors).
- **NFR-005** — Recordings persist in durable object storage until both Transcript and Protocol are produced.

## Sign-off

- [ ] BE tests in `test-spec.md` all pass.
- [ ] FE tests in `test-spec-fe.md` all pass.
- [ ] `/nacl-tl-qa UC-100` end-to-end run is green.
- [ ] `/nacl-tl-review` BE and FE both APPROVED.
