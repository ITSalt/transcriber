# UC-004 — Frontend Implementation Brief

> Source: Neo4j SA layer (UC-004, CMP-RetryProcessing, FORM-MeetingDetail). FR-001. Depends on UC-004-BE.

## 1. Pages/routes
- Extends the existing Meeting detail page (FORM-MeetingDetail, hosted by UC-002-FE — already done). No new route.

## 2. Components
- **CMP-RetryProcessing** — action/input component, rendered conditionally when Meeting.status=FAILED (RQ-036).
- Reuses **CMP-ConfirmDialog** for confirmation (AS02).

## 3. API client hook
- `useRetryMeeting(meetingId)` → POST /api/meetings/:id/retry (TanStack Query mutation). On success, invalidate the meeting query so SSE-driven status renders.

## 4. State management
- Button disabled while mutation is pending (double-submit guard, RQ-035).
- 409 → toast, no state change (RQ-036).

## 5. i18n
- i18next keys for action label, confirm copy, success/conflict toasts (RU/EN).
