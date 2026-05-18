# UC-301 — Acceptance Criteria

**UC:** Review and edit protocol

## Criteria

- [ ] GIVEN Meeting.status in {PROTOCOL_READY, EDITED}, WHEN I open the protocol, THEN it loads in a Markdown editor with rendered preview.
- [ ] WHEN I save changes, THEN Protocol.markdown_content is updated, version increments by 1 (BRQ-014), edit_count increments by 1 (BRQ-015), last_edited_at is set, and Meeting.status -> EDITED.
- [ ] All edits operate on the canonical Markdown (BRQ-018); preview is a derivation.

## Tied to requirements

- **RQ-027** — Each save increments version by exactly 1 (BRQ-014); monotonic.
- **RQ-028** — Each save increments edit_count by exactly 1 (BRQ-015); equals manual-save count since generation.
- **RQ-029** — First save: Meeting.status PROTOCOL_READY -> EDITED (BRQ-008). Subsequent saves keep status=EDITED. last_edited_at updated every save.
- **RQ-030** — Edits operate on canonical Markdown (BRQ-018); preview is a derivation, never persisted.
- **RQ-031** — Editor warns AUTHOR before navigating away with unsaved changes.

## Sign-off

- [ ] BE tests in `test-spec.md` all pass.
- [ ] FE tests in `test-spec-fe.md` all pass.
- [ ] `/nacl-tl-qa UC-301` end-to-end run is green.
- [ ] `/nacl-tl-review` BE and FE both APPROVED.
