# API contract — UC-304 «Оставить отзыв на протокол» (FR-005, WP-API-FEEDBACK-01)

Wire types: `shared/src/api/feedback.ts` (`FeedbackFields`, `checkFeedbackSubmission`, `FeedbackExtract`, `FeedbackCreateResponse`),
`shared/src/api/errors.ts`. Error body: `{code, message, details?}`. Code: `api/src/features/feedback/routes.ts`, `docx.ts`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/meetings/:id/feedback` | `multipart/form-data`: `kind` (`COMMENT` \| `CORRECTED_PROTOCOL` \| `DOCX_REVIEW`), `category?`, `text?`, one optional part `file` → 201 `FeedbackCreateResponse` (`FeedbackItem` + `extracted`) |

Rules by kind (RQ-052): `COMMENT` — text (+ optional category: `SPEAKER_ATTRIBUTION` · `MISSED_DECISION` · `WRONG_TASK` · `FABRICATED` ·
`TERMS_NAMES` · `STYLE` · `OTHER`), no file. `CORRECTED_PROTOCOL` — text OR file `.md`/`.txt`/`.docx`. `DOCX_REVIEW` — file `.docx`.
File ≤ 20 MB; extension, MIME (parameters ignored, `application/octet-stream` accepted) and, for `.docx`, the `PK\x03\x04` signature are checked.
Empty form fields are treated as absent. The feedback is bound to the CURRENT version: `protocol_version_n` = max `n`.

Storage: `s3://<bucket>/ws/<workspaceId>/feedback/<feedbackId>/<sanitized file name>` (no path, no special characters, ≤ 120 chars).
If the DB row cannot be written the stored object is deleted.

`extracted` (RQ-053): `DOCX_REVIEW` — `comments [{id, author, date, text, anchored_text}]`, `revisions [{type ins\|del, author, date, text}]`,
`accepted_text` (insertions kept, deletions dropped), `original_text`; `CORRECTED_PROTOCOL` — `plain_text` (`.docx` with changes accepted; `.md`/`.txt`
= UTF-8 text without BOM); text-only or `COMMENT` — `null`. A parse failure does NOT fail the request: 201, file stored, `extracted.error` set.
`extracted_counts` = `{comments, revisions, error}` or `null`.

Errors:
- `400 FEEDBACK_TEXT_REQUIRED` «Напишите текст» · `400 FEEDBACK_FILE_REQUIRED` «Приложите файл» · `400 VALIDATION_ERROR` (bad `kind`/`category`, not multipart, multipart limits).
- `413 FEEDBACK_FILE_TOO_LARGE` «Файл слишком большой».
- `415 FEEDBACK_FILE_TYPE` «Этот тип файла не принимается» — extension, MIME, file on a `COMMENT`, `.docx` that is not a zip.
- `401 UNAUTHENTICATED` «Нужно войти» — the legacy principal without a session (D-20, `AUTH_REQUIRED=false`): `ProtocolFeedback.user_id` is mandatory (RQ-065, DEC-012; open to the owner as P-17).
- `404 PROTOCOL_VERSION_NOT_FOUND` — the meeting has no protocol version yet.
- `404 NOT_FOUND` — foreign or nonexistent meeting (same body, RQ-044).
- `500 STORAGE_WRITE_FAILED` — object storage unavailable.

## Development result (WP-API-FEEDBACK-01)

- `docx.ts` — direct extraction from `word/document.xml` + `word/comments.xml` (jszip + fast-xml-parser, XML validated, 64 MB inflate cap per part).
- Tests: `docx.test.ts` (fixture assembled in the test: 2 comments, 1 insertion, 1 deletion; broken file), `routes.test.ts` (three kinds, size/type/signature
  rejection, version binding, cleanup on DB failure, isolation on all 5 routes). api suite 256 passed; typecheck green; lint 0 errors.
- Orchestrator review: ACCEPTED (PR #21, `a7798d4`); report `product/reports/wp-api-feedback-01-review-20261008.md`.
- Not verified on a real MinIO (storage is mocked in unit tests).
