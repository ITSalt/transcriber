# Feature Request: FR-005 — Protocol versions, generation audit and feedback

## Metadata

| Field | Value |
|-------|-------|
| Created | 2026-10-07 |
| Status | spec-complete |
| Source | `/nacl-sa-feature` — program «Модернизация Transcrib до продукта», WP-BACKEND-06 (contract v1) |
| Impact method | Neo4j graph traversal (sa_impact_analysis) + program decisions |
| Decision | `DEC-008` (program: D-3, D-12) |
| Implemented by | WP-BACKEND-01 (USER_EDIT on save), WP-WORKER-01 (GENERATED + ProtocolGeneration), WP-API-FEEDBACK-01, WP-WEB-FEEDBACK-01 |

## Feature Description

Protocol history becomes append-only `ProtocolVersion` rows (generated / user edit /
legacy backfill) while `Protocol` keeps the current text; every LLM run is audited in
`ProtocolGeneration`; feedback (comment, corrected protocol, Word review parsed to JSON)
is bound to the version it was given on.

## Impact Summary

| Area | Change | Details |
|------|--------|---------|
| Architecture | no change | extends `mod-protocol` |
| Domain | +3 entities, +4 enums | ProtocolGeneration, ProtocolVersion, ProtocolFeedback; ProtocolGenerationKind, ProtocolVersionKind, ProtocolFeedbackKind, ProtocolFeedbackCategory |
| Use Cases | +3 NEW | UC-303, UC-304, UC-305 |
| Use Cases | ~2 MODIFIED | UC-300 (version 1 + generation record), UC-301 (USER_EDIT per save) |
| Requirements | RQ-050..RQ-053 | |

## Contract v1 (code)

- Prisma: `ProtocolGeneration`, `ProtocolVersion` (unique `meetingId, n`), `ProtocolFeedback`;
  backfill: each existing protocol → v1 (`LEGACY` if `edit_count > 0`, else `GENERATED`).
- `shared/src/api/feedback.ts`: version DTOs, `FeedbackFields`, `checkFeedbackSubmission`,
  `FeedbackExtract`, file limits (20 MB) and accepted types, zip signature.
- Dependencies: `@fastify/multipart`, `jszip`, `fast-xml-parser` (api).

## New UCs to Plan

- UC-303: Посмотреть версии протокола. UC-304: Оставить отзыв на протокол.
- UC-305: Посмотреть отзывы и скачать файл.

## Modified UCs to Re-plan

- UC-300: write `ProtocolGeneration(kind PROTOCOL)` + `ProtocolVersion n=1 GENERATED` with the Protocol.
- UC-301: each save writes `ProtocolVersion USER_EDIT` with `author_user_id` in the same transaction.

## Known transition gap

The pre-program code keeps writing `Protocol` without versions until WP-WORKER-01 /
WP-BACKEND-01 ship. Consumers must treat "Protocol without versions" as an implicit v1 or
re-run the idempotent backfill (the `INSERT … ON CONFLICT DO NOTHING` block of migration
`20261007120000_program_product_schema`) in their own migration.

## Decisions

- DEC-008: append-only versions, Protocol keeps the current text.

## Skills Invoked

- `nacl-sa-feature`.
