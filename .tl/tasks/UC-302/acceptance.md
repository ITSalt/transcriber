# UC-302 — Acceptance Criteria

**UC:** Export protocol to PDF

## Criteria

- [ ] GIVEN Meeting.status in {PROTOCOL_READY, EDITED}, WHEN I click 'Export PDF', THEN the system renders the current Markdown to PDF and delivers it as a download.
- [ ] The rendered PDF is NOT persisted (BRQ-017); each export re-renders from canonical Markdown.
- [ ] The exported document includes all four required sections (BRQ-011): Participants, Discussion Topics, Decisions, Action Items.

## Tied to requirements

- **RQ-032** — PDF export is transient: rendered PDF MUST NOT be persisted (BRQ-017); each export re-renders from canonical Markdown (BRQ-018).
- **RQ-033** — Exported PDF MUST include the four required sections (BRQ-011). On render failure, no file delivered and no state change persisted.

## Sign-off

- [ ] BE tests in `test-spec.md` all pass.
- [ ] `/nacl-tl-review` BE and FE both APPROVED.
