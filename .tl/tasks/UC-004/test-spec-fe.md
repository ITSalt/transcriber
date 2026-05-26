# UC-004 — Frontend Test Spec: Retry processing action

> Source: Neo4j SA layer (UC-004 user steps, CMP-RetryProcessing, RQ-035/036). FR-001.

## Scenarios

### TS-FE-1 — Action visible only on FAILED (RQ-036, AS01)
- Render Meeting detail with status=FAILED → "Retry processing" action + error_reason shown.
- Render with status in {TRANSCRIBING, PROTOCOL_GENERATING, DONE} → action hidden.

### TS-FE-2 — Confirm dialog (AS02)
- Clicking the action opens CMP-ConfirmDialog; confirming fires POST /api/meetings/:id/retry; cancelling fires nothing.

### TS-FE-3 — Success updates UI
- On 200, the meeting query is invalidated/refetched; status renders TRANSCRIBING | PROTOCOL_GENERATING.

### TS-FE-4 — 409 toast (RQ-036)
- On 409 from the API, show a non-destructive toast; no UI state change.

### TS-FE-5 — Double-submit guard (RQ-035)
- The action button is disabled while a retry request is in flight.

### TS-FE-6 — i18n
- Action label, dialog copy, and toast render correctly in RU and EN.
