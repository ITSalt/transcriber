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

The pre-program code keeps running until WP-WORKER-01 / WP-BACKEND-01 ship, and it writes
`Protocol` without versions in two ways: the worker creates new protocols, and the UC-301
save path (`api/src/services/uc-301.service.ts`) overwrites `markdown_content` of protocols
that already have a backfilled v1. Re-running the `ON CONFLICT DO NOTHING` backfill covers
only the first case. **The first consumer migration that starts writing versions
(WP-BACKEND-01 for USER_EDIT, WP-WORKER-01 for GENERATED — whichever merges first, the
other re-runs it harmlessly) must reconcile both**, in this order, before its code ships:

```sql
-- 1. protocols with no version at all → v1 (same rule as the original backfill)
INSERT INTO "protocol_versions" ("id", "meeting_id", "n", "kind", "markdown", "created_at")
SELECT gen_random_uuid(), p."meeting_id", 1,
       (CASE WHEN p."edit_count" > 0 THEN 'LEGACY' ELSE 'GENERATED' END)::"ProtocolVersionKind",
       p."markdown_content", COALESCE(p."last_edited_at", p."generated_at")
FROM "protocols" p
ON CONFLICT ("meeting_id", "n") DO NOTHING;

-- 2. protocols whose current text differs from their latest version → next LEGACY version
INSERT INTO "protocol_versions" ("id", "meeting_id", "n", "kind", "markdown", "created_at")
SELECT gen_random_uuid(), p."meeting_id", v."n" + 1, 'LEGACY'::"ProtocolVersionKind",
       p."markdown_content", COALESCE(p."last_edited_at", p."updated_at")
FROM "protocols" p
JOIN LATERAL (
  SELECT pv."n", pv."markdown" FROM "protocol_versions" pv
  WHERE pv."meeting_id" = p."meeting_id" ORDER BY pv."n" DESC LIMIT 1
) v ON true
WHERE v."markdown" <> p."markdown_content"
ON CONFLICT ("meeting_id", "n") DO NOTHING;
```

After that the invariant holds: the latest `ProtocolVersion.markdown` of every meeting
equals `Protocol.markdown_content`, so feedback bound to `current_n` refers to the text the
user sees. Until then, the API must compute `current_n` from the latest version only when
its markdown matches `Protocol.markdown_content`.

## Decisions

- DEC-008: append-only versions, Protocol keeps the current text.

## Skills Invoked

- `nacl-sa-feature`.
