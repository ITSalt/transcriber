# UC-201 — Acceptance Criteria

**UC:** View and download transcript

## Criteria

- [ ] GIVEN Meeting.status >= TRANSCRIPT_READY, WHEN I open the transcript view, THEN I see segments with speaker labels, timestamps, and counts (segments_count, speakers_count).
- [ ] I can download the transcript as a text file with a one-click action.
- [ ] Unresolved speakers (BRQ-021) are shown as 'Speaker N'; resolved speakers show the real name.

## Tied to requirements

- **RQ-019** — Transcript view MUST display each segment with its speaker label (resolved from speaker_map or 'Speaker N') and minute/second timestamps.
- **RQ-020** — Download produces a plain-text file (.txt) with verbatim transcript + speaker labels + timestamps. Filename: '<meeting-title>-transcript.txt' (or filename fallback when title is null).

## Sign-off

- [ ] BE tests in `test-spec.md` all pass.
- [ ] FE tests in `test-spec-fe.md` all pass.
- [ ] `/nacl-tl-qa UC-201` end-to-end run is green.
- [ ] `/nacl-tl-review` BE and FE both APPROVED.
