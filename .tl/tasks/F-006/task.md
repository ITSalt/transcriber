# F-006 — Browser upload has no per-part retry and never aborts, leaking billable multipart parts

**Type:** follow-up (spun out of FR-002 / DEC-004, 2026-08-15)
**Status:** open
**Created:** 2026-08-15
**Owner:** frontend lead
**Related:** `FR-002`, `DEC-004`, `UC-100`, `RQ-008`, `web/src/routes/upload/index.tsx`

## Source

Identified while raising the upload cap to 1.5 GiB (FR-002). Deliberately excluded
from that change's code scope, which covered the limit, the duration gate and the
pipeline fixes that make the cap reachable.

## Problem

Two defects in the browser-side multipart upload, both of which get materially worse
as file size grows:

1. **No per-part retry.** `web/src/routes/upload/index.tsx` uploads parts in
   `Promise.all` batches of 4. A single failed `PUT` — one dropped connection out of
   154 at the new 1.5 GiB ceiling — rejects the whole batch and aborts the entire
   upload. There is no retry and no resume, so the user starts over from zero.

2. **Never calls `/api/uploads/abort`.** On error the component sets error state and
   stops. The S3 multipart upload is left open with every part already transferred
   still stored. Those parts are **billable** and are not reachable by
   `uc-003.service.ts`, which only deletes completed objects. A page reload during
   an upload leaks them the same way.

At the previous 1 GiB cap this was already true; at 1.5 GiB, and with the presign
window now 6 hours, the exposure window per failed upload is larger.

## Deliverable

1. Per-part retry with exponential backoff, bounded (3 attempts is consistent with
   `JOB_RETRY_OPTIONS` on the server side).
2. Call `POST /api/uploads/abort` on unrecoverable failure and on component unmount
   / `beforeunload` while an upload is in flight.
3. A test that a failed part triggers retry, and that exhausting retries issues the
   abort call.

## Consider also

An S3 lifecycle rule on the bucket to expire incomplete multipart uploads after N
days is the belt-and-braces backstop — a client-side abort can never be guaranteed
(hard crash, killed tab). Worth doing regardless of item 2. Requires Cloud.ru
bucket-level configuration, not a code change.

## Non-goal

Resumable upload across page reloads (persisting `s3_upload_id` + completed part
ETags to `sessionStorage`). That is a separate feature; `RC-UC-100.recovery_procedure`
already documents "requires re-uploading from scratch" as a known gap.
