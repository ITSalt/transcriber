# API contract — UC-305 «Посмотреть отзывы и скачать файл» (FR-005, WP-API-FEEDBACK-01)

Wire types: `shared/src/api/feedback.ts` (`FeedbackListResponse`, `FeedbackItem`), `shared/src/api/errors.ts`.
Code: `api/src/features/feedback/routes.ts`. Access: session + workspace membership (UC-402).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/meetings/:id/feedback` | 200 `{items: FeedbackItem[]}` — newest first; item: `id, meeting_id, protocol_version_n, kind, category, text, file {name, mime, size_bytes, download_path}\|null, extracted_counts {comments, revisions, error}\|null, author {id,name}, created_at` |
| GET | `/api/meetings/:id/feedback/:feedbackId/file` | 200 the stored file: `Content-Disposition: attachment` (ASCII fallback + `filename*=UTF-8''…`), stored `Content-Type`, `X-Content-Type-Options: nosniff`, `Content-Length` |

Only feedback of this meeting in its workspace is listed or downloadable.

Errors: `404 NOT_FOUND` «Не найдено» — foreign or nonexistent meeting, unknown `feedbackId`, feedback without a file, feedback of another meeting,
or a stored object that is gone (all the same body, RQ-044) · `400 VALIDATION_ERROR` — `:id`/`:feedbackId` is not a UUID · `500 STORAGE_READ_FAILED`.

## Development result (WP-API-FEEDBACK-01)

Tests: `routes.test.ts` (newest-first list, download headers and body, four 404 variants, another workspace's feedback never leaks) and
`api/test/auth-isolation.db.test.ts` (23/23). Orchestrator review: ACCEPTED (PR #21, `a7798d4`). Download streaming not verified on a real MinIO.
