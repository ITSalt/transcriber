# UC-100 — Acceptance Criteria

**UC:** Upload meeting video
**Regenerated:** 2026-08-15 by `/nacl-tl-plan` (spec_version 2, post-DEC-003)

## Criteria

- [ ] GIVEN a valid MP4/MKV/MOV/WebM file <= 1 GiB (BRQ-001, BRQ-002), WHEN I upload, THEN the system accepts, creates Meeting + Recording + TranscriptionJob, and shows status UPLOADING -> TRANSCRIBING.
- [ ] GIVEN a file > 1 GiB or a MIME type outside the accepted set, WHEN I attempt upload, THEN the system rejects before storage with a clear error.
- [ ] GIVEN a corrupt file (BRQ-003), WHEN validation fails, THEN the system rejects with a user-facing error.
- [ ] I can choose RU or EN as the **protocol** language; leaving it blank means AUTO — the protocol is generated in **Russian** (BRQ-013) and the ASR auto-detects the spoken language (BRQ-005). Choosing EN is the only way to obtain an English protocol (RQ-012).
- [ ] GIVEN I leave the language blank, WHEN the protocol is generated, THEN it is in Russian — never English — regardless of the detected transcript language.
- [ ] I may optionally supply a speaker-count hint (1–10) to pin diarization (RQ-037).

## Tied to requirements

- **RQ-008** — Reject `size_bytes > 1,073,741,824` (1 GiB) BEFORE any storage upload begins.
- **RQ-009** — Accept exactly {video/mp4, video/x-matroska, video/quicktime, video/webm}; reject others with a clear user-facing error.
- **RQ-010** — Verify container integrity at upload acceptance (probe header / short sample). Corrupt files rejected before Recording is persisted (BRQ-003).
- **RQ-011** — On successful upload completion, atomically: (1) finalize Recording metadata; (2) transition Meeting.status UPLOADING -> TRANSCRIBING (BRQ-008); (3) create exactly one TranscriptionJob per Recording (BRQ-006).
- **RQ-012** — Language selector accepts RU, EN, or blank. Blank means `Meeting.language` takes its default AUTO (NOT NULL); AUTO yields ASR auto-detection per BRQ-005 and a **Russian** protocol per BRQ-013. Selecting EN is the only way to obtain an English protocol.
- **RQ-013** — Meeting.title defaults to Recording.filename (without extension) when AUTHOR leaves the field blank.
- **RQ-037** — Optional `speaker_count` hint (1–10) passed through to the ASR provider to pin diarization.
- **NFR-001** — Upload pipeline accepts large files via chunked transfer without timeout. *(Graph text still reads 500 MB and contradicts RQ-008 — pending correction by the upload-limit feature.)*
- **NFR-002** — Transcription/protocol run asynchronously; UI surfaces job progress without blocking.
- **NFR-004** — Support RU and EN throughout (UI, ASR hint, prompts, errors).
- **NFR-005** — Recordings persist in durable object storage until both Transcript and Protocol are produced.

## Sign-off

- [ ] BE tests in `test-spec.md` all pass.
- [ ] FE tests in `test-spec-fe.md` all pass.
- [ ] `/nacl-tl-qa UC-100` end-to-end run is green.
- [ ] `/nacl-tl-review` BE and FE both APPROVED.
