---
id: UC-004-FE
title: Retry processing action — frontend
type: uc-fe
uc: UC-004
module: mod-common
actor: AUTHOR
wave: 13
priority: high
intake_id: FR-001
depends_on: ['UC-004-BE']
blocks: []
---

# UC-004-FE — Retry processing action (Meeting detail)

> Source: Neo4j SA layer (UC-004, CMP-RetryProcessing, FORM-MeetingDetail). FeatureRequest FR-001.

## User story

> As an AUTHOR viewing a FAILED meeting, I see the error reason and a "Retry processing" action;
> clicking it (and confirming) re-runs the failed stage and the page reflects the new in-progress status.

## User interactions (from UC-004-AS01..AS02, AS06)

1. (AS01) Open the detail page of a Meeting whose status is FAILED; the page shows `error_reason` and a "Retry processing" action (RQ-036).
2. (AS02) Click "Retry processing" and confirm in the dialog.
3. (AS06) The action is rendered ONLY when Meeting.status=FAILED; in any other status it is hidden (RQ-036). A 409 from the API surfaces as a non-destructive toast.

## Components

- **CMP-RetryProcessing** (`input`, AUTHOR) — USED_IN FORM-MeetingDetail. New component.
- Reuses **CMP-ConfirmDialog** for the confirmation step.

## Form (reuse — FORM-MeetingDetail, no new FormFields)

UC-004 USES_FORM FORM-MeetingDetail. The retry action lives alongside the existing read-only
detail fields (status `F03`, `error_reason` `F10`, `delete_button` `F11`). No new FormFields.

## API call to consume

`POST /api/meetings/:id/retry` (see `api-contract.md`). On 200, refresh the meeting query (TanStack
Query invalidation) so the SSE-driven status (TRANSCRIBING | PROTOCOL_GENERATING) renders.

## Requirements

| ID | Description |
|----|-------------|
| RQ-036 | Action visible ONLY when status=FAILED; otherwise hidden. 409 → toast, no UI state change. |
| RQ-035 | Idempotent backend — UI must disable the button while a retry request is in flight to avoid double-submit. |

## i18n

RU/EN strings for the action label, confirm dialog copy, and the 409 toast.
