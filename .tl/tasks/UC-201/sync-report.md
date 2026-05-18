# UC-201 — BE/FE Sync Report

**UC:** View and download transcript
**Verifier:** nacl-tl-sync (verifier agent)
**Date:** 2026-05-18
**Verdict:** PASS

---

## Scope

Static data-flow analysis of:
- `api/src/routes/uc-201.ts` (BE route)
- `api/src/services/uc-201.service.ts` (BE service)
- `shared/src/api/uc201.ts` (shared schema)
- `web/src/routes/transcript/index.tsx` (FE page)
- `web/src/routes/transcript/components/DownloadMenu.tsx` (FE download)
- `web/src/lib/api.ts` (FE API client)
- `.tl/tasks/UC-201/api-contract.md` (contract reference)

---

## Check 1 — Endpoint Paths

| Endpoint | BE declaration | FE usage | Match |
|----------|---------------|----------|-------|
| JSON transcript | `GET /api/meetings/:id/transcript` | `apiGet(\`/api/meetings/${meetingId}/transcript\`, TranscriptResponse)` | YES |
| Download | `GET /api/meetings/:id/transcript/download` | `window.location.href = \`/api/meetings/${meetingId}/transcript/download?format=${format}\`` | YES (path matches; see Check 5 for format param) |

Verdict: PASS

---

## Check 2 — Shared Schema Binding

- `shared/src/api/uc201.ts` exports `TranscriptResponse` (Zod schema + inferred type).
- `shared/src/api/index.ts` re-exports it via `export * from './uc201.js'`.
- BE (`api/src/routes/uc-201.ts`): `import { TranscriptResponse } from '@transcrib/shared'` — used as Fastify response schema `response: { 200: TranscriptResponse }`.
- FE (`web/src/routes/transcript/index.tsx`): `import { TranscriptResponse } from "@transcrib/shared"` — passed to `apiGet` for runtime Zod parse at the network boundary.
- Both sides reference the same single source schema object. No inline DTO duplication detected.

Verdict: PASS

---

## Check 3 — Download Content-Type

- BE sets `Content-Type: text/plain; charset=utf-8` and `Content-Disposition: attachment; filename="<name>-transcript.txt"`.
- FE triggers download via `window.location.href = ...` (browser-native file save). The browser receives and saves the response without FE-side parsing. No Content-Type expectation mismatch.
- API contract specifies `text/plain` for the download endpoint. BE conforms.

Verdict: PASS

---

## Check 4 — Error Code Consistency

| Error code | BE | FE handling |
|-----------|-----|-------------|
| 404 TRANSCRIPT_NOT_FOUND | `AppError('TRANSCRIPT_NOT_FOUND', 404, ...)` serialized as `{ code, message }` | `ApiError(res.status, message)` — surfaces as generic `transcript.error` UI state |
| 409 STATUS_NOT_READY | `AppError('STATUS_NOT_READY', 409, ...)` serialized as `{ code, message }` | `ApiError(res.status, message)` — surfaces as generic `transcript.error` UI state |
| 500 INTERNAL_ERROR | `AppError('INTERNAL_ERROR', 500, ...)` | same generic error state |

The FE `api.ts` client reads `body.message` from error responses but does not branch on `body.code`. Both 404 and 409 render the same generic error block with a Retry button. This is a known UX limitation documented as M1 minor issue in the FE review (`review-fe.md`). It is not a contract violation — errors are surfaced correctly, just not differentiated in UI. The contract does not require the FE to present distinct UI per error code.

Verdict: PASS (with noted minor UX limitation already in FE review)

---

## Check 5 — Format Query Parameter Divergence

**Finding: DIVERGENCE (severity: MINOR — no contract violation)**

The FE `DownloadMenu` component sends three distinct download requests:
- `GET /api/meetings/:id/transcript/download?format=txt`
- `GET /api/meetings/:id/transcript/download?format=json`
- `GET /api/meetings/:id/transcript/download?format=md`

The BE download route declares no `querystring` schema for `format`. The service `getTranscriptDownload` ignores any query parameter and always returns the raw `transcript.rawText` as a plain-text `.txt` file, regardless of the requested format.

**Effect:** All three FE download buttons produce identical output — a plain-text file with the verbatim transcript. The "Download JSON" and "Download Markdown" labels imply different formats that the BE does not implement.

**Contract status:** The `api-contract.md` specifies the download endpoint as returning `text/plain` with no mention of a `format` parameter. The BE is therefore compliant with the published contract. The FE is generating requests with a query param that is outside the contract scope.

**Root cause:** The FE `DownloadMenu` was implemented with three format buttons in anticipation of future multi-format support, but the BE was implemented strictly per the current contract (text/plain only). The FE review (`review-fe.md`) did not flag this discrepancy.

**Risk:** Functional — no crash or error, but user expectation mismatch. Clicking "Download JSON" saves a `.txt` file, not JSON. The FE test suite does not assert on the format parameter or resulting file type.

**Recommendation:** Either (a) remove the JSON and Markdown download buttons from the FE until the BE implements multi-format support, or (b) extend the BE download route to handle `?format=json` and `?format=md` and update the api-contract. This should be resolved before the QA gate.

---

## Summary

| Check | Result | Notes |
|-------|--------|-------|
| 1. Endpoint paths | PASS | Exact match on both endpoints |
| 2. Shared schema binding | PASS | Single `TranscriptResponse` from `@transcrib/shared` on both sides |
| 3. Download content-type | PASS | `text/plain` per contract, browser-native file save on FE |
| 4. Error code consistency | PASS | Errors surface correctly; 404/409 distinction is a UX gap (pre-existing M1) |
| 5. Format query param | DIVERGENCE (minor) | FE sends `?format=` param; BE ignores it; all formats return identical `.txt` output |

---

## Verdict: PASS

The core contract (endpoint paths, shared schema, response types, error serialization) is consistent between BE and FE. The `?format=` query param divergence is a minor functional issue that does not break the contract but creates a user-visible misleading UI. It does not rise to a FAIL verdict because the contract itself only specifies `text/plain`, the BE is correct per contract, and no crash or data loss occurs. The issue is tracked as a follow-up item.

**Recommended follow-up task:** Align FE `DownloadMenu` with the current BE capability (txt only) OR extend the BE contract to support multi-format downloads before the QA gate.
