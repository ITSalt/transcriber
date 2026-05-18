# UC-001 — Acceptance Criteria

**UC:** View meeting catalog

## Criteria

- [ ] GIVEN at least one Meeting exists, WHEN I open the catalog, THEN I see a list of meetings sorted by updated_at descending.
- [ ] EACH row shows: title (or filename fallback), status badge (per ENUM-MeetingStatus), language, uploaded_at, duration if available.
- [ ] GIVEN a meeting in a transient state (UPLOADING / TRANSCRIBING / PROTOCOL_GENERATING), THEN its row shows a progress indicator that auto-refreshes.

## Tied to requirements

- **RQ-001** — Meeting catalog MUST sort meetings by updated_at descending.
- **RQ-002** — Meeting rows in transient statuses (UPLOADING, TRANSCRIBING, PROTOCOL_GENERATING) MUST auto-refresh their status without requiring a full page reload.
- **RQ-003** — AUTHOR sees only own meetings (BRQ-016). Enforcement deferred until auth is added (NFR-007); MVP semantically equivalent to 'all'.
- **NFR-007** — MVP runs without authentication; single trust boundary.

## Sign-off

- [ ] BE tests in `test-spec.md` all pass.
- [ ] FE tests in `test-spec-fe.md` all pass.
- [ ] `/nacl-tl-qa UC-001` end-to-end run is green.
- [ ] `/nacl-tl-review` BE and FE both APPROVED.
