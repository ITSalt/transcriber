# API contract — UC-303 «Посмотреть версии протокола» (FR-005, WP-API-FEEDBACK-01)

Wire types: `shared/src/api/feedback.ts` (`ProtocolVersionListResponse`, `ProtocolVersionResponse`),
`shared/src/api/errors.ts`. Error body: `{code, message, details?}`, `message` = Russian UI text.
Code: `api/src/features/feedback/routes.ts`. Access: session + workspace membership (UC-402).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/meetings/:id/protocol/versions` | 200 `{items: [{n, kind, author {id,name}\|null, generation_id\|null, created_at}], current_n}` — ascending by `n`; `current_n` = max `n` or `null` when there is no version |
| GET | `/api/meetings/:id/protocol/versions/:n` | 200 `ProtocolVersionResponse` (summary + `markdown`) |

`kind`: `GENERATED` · `USER_EDIT` (author set) · `LEGACY` (backfilled, edited before the program; original lost).

Errors:
- `404 NOT_FOUND` «Не найдено» — foreign and nonexistent meeting answer identically (RQ-044); checked before validation.
- `404 PROTOCOL_VERSION_NOT_FOUND` «Такой версии протокола нет» — unknown `n`; also `n` that is not a positive integer or exceeds int4 (`0`, `-1`, `abc`, `99999999999`).
- `400 VALIDATION_ERROR` — `:id` is not a UUID.

## Development result (WP-API-FEEDBACK-01)

Delivered in `api/src/features/feedback/routes.ts`; tests `routes.test.ts` (list, read, unknown/malformed `n`, isolation) and the
route-wide isolation test `api/test/auth-isolation.db.test.ts` (23/23 on PG16). Orchestrator review: ACCEPTED (PR #21, `a7798d4`).
