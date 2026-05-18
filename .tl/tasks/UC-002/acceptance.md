# UC-002 — Acceptance Criteria

**UC:** View meeting detail

## Criteria

- [ ] GIVEN a Meeting, WHEN I open its detail page, THEN I see: title, language, status, recording metadata (filename, size, duration), and current job error_reason when FAILED.
- [ ] GIVEN status >= TRANSCRIPT_READY, THEN a link to view the transcript is visible (UC-201).
- [ ] GIVEN status >= PROTOCOL_READY, THEN a link to review/edit the protocol is visible (UC-301).

## Tied to requirements

- **RQ-002** — Auto-refresh status without full page reload.
- **RQ-003** — AUTHOR sees only own meetings (deferred per NFR-007).
- **RQ-004** — Meeting detail MUST surface the current job's error_reason when Meeting.status=FAILED.
- **RQ-005** — Action links gated by status: 'View transcript' enabled in {TRANSCRIPT_READY, PROTOCOL_GENERATING, PROTOCOL_READY, EDITED}; 'Review/Edit protocol' enabled in {PROTOCOL_READY, EDITED}; 'Export PDF' enabled in {PROTOCOL_READY, EDITED}.
- **NFR-007** — MVP no-auth single trust boundary.

## Sign-off

- [ ] BE tests in `test-spec.md` all pass.
- [ ] FE tests in `test-spec-fe.md` all pass.
- [ ] `/nacl-tl-qa UC-002` end-to-end run is green.
- [ ] `/nacl-tl-review` BE and FE both APPROVED.
