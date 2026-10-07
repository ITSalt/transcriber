-- Migration: every meeting has a workspace (WP-BACKEND-01, FR-003; D-6, D-7, A-5)
--
-- 1. Re-backfill: meetings created by the pre-program code after
--    20261007120000_program_product_schema got «Роман» through the temporary DB default;
--    this repeats the backfill for any row that still has no workspace (idempotent).
-- 2. Drop that default and set NOT NULL: from now on code that forgets the workspace fails
--    loudly instead of silently filing the meeting under «Роман».
-- 3. A-5: transcription_jobs.speaker_count — the speaker hint must survive a deferred start
--    (upload complete with defer_start → POST /api/meetings/:id/start enqueues the job).
-- 4. ProtocolVersion reconciliation (FR-005): protocols the pre-program code created or
--    edited after the previous migration have no / a stale latest version. Two idempotent
--    steps; a no-op when WP-WORKER-01 already reconciled.
--
-- Compatibility: additive except the NOT NULL. The previous code still running while
-- `migrate deploy` executes (deploy migrates before the dist swap) inserts meetings without
-- workspace_id; between this migration and `pm2 start` such an insert fails (upload
-- finalize 500) — the window is the build step of the deploy. Delivery order makes it
-- final: once this package runs, nothing creates meetings without a workspace.
-- Prisma runs this file WITHOUT a transaction; on failure use down.sql (deploy-plan §5).

-- 1. re-backfill (same literal as LEGACY_WORKSPACE_ID)
UPDATE "meetings"
SET "workspace_id" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "workspace_id" IS NULL;

-- 2. no more silent default; ownership is mandatory
-- AlterTable
ALTER TABLE "meetings" ALTER COLUMN "workspace_id" SET NOT NULL,
ALTER COLUMN "workspace_id" DROP DEFAULT;

-- 3. A-5
-- AlterTable
ALTER TABLE "transcription_jobs" ADD COLUMN     "speaker_count" INTEGER;

-- 4a. protocols with no version at all → v1 (rule of the original backfill)
INSERT INTO "protocol_versions" ("id", "meeting_id", "n", "kind", "markdown", "created_at")
SELECT gen_random_uuid(),
       p."meeting_id",
       1,
       (CASE WHEN p."edit_count" > 0 THEN 'LEGACY' ELSE 'GENERATED' END)::"ProtocolVersionKind",
       p."markdown_content",
       COALESCE(p."last_edited_at", p."generated_at")
FROM "protocols" p
ON CONFLICT ("meeting_id", "n") DO NOTHING;

-- 4b. protocols whose current text differs from their latest version → next LEGACY version
INSERT INTO "protocol_versions" ("id", "meeting_id", "n", "kind", "markdown", "created_at")
SELECT gen_random_uuid(),
       p."meeting_id",
       v."n" + 1,
       'LEGACY'::"ProtocolVersionKind",
       p."markdown_content",
       COALESCE(p."last_edited_at", p."updated_at")
FROM "protocols" p
JOIN LATERAL (
  SELECT pv."n", pv."markdown" FROM "protocol_versions" pv
  WHERE pv."meeting_id" = p."meeting_id" ORDER BY pv."n" DESC LIMIT 1
) v ON true
WHERE v."markdown" <> p."markdown_content"
ON CONFLICT ("meeting_id", "n") DO NOTHING;
