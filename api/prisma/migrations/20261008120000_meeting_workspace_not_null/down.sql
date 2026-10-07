-- DOWN for 20261008120000_meeting_workspace_not_null (WP-BACKEND-01). NOT run by Prisma.
--
-- Returns the schema to its state after 20261007120000_program_product_schema, from a fully
-- or partially applied run (Prisma does not wrap migration.sql in a transaction):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f api/prisma/migrations/20261008120000_meeting_workspace_not_null/down.sql
--   pnpm --filter @transcrib/api run db:migrate:deploy        # re-apply (or deploy the previous code)
-- Runbook: .tl/deploy-plan.md §5. One transaction, idempotent, keeps every row.
-- Not undone on purpose: the backfilled workspace ids (they are correct either way) and the
-- reconciled ProtocolVersion rows (they mirror protocol texts that really existed; the
-- previous code never reads protocol_versions). Lost: transcription_jobs.speaker_count
-- values — only meaningful for meetings still in AWAITING_START.
-- To roll back further, run 20261007120000_program_product_schema/down.sql afterwards.

BEGIN;

ALTER TABLE "transcription_jobs" DROP COLUMN IF EXISTS "speaker_count";

ALTER TABLE "meetings" ALTER COLUMN "workspace_id" DROP NOT NULL;
ALTER TABLE "meetings" ALTER COLUMN "workspace_id" SET DEFAULT '00000000-0000-4000-8000-000000000001'::uuid;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261008120000_meeting_workspace_not_null';

COMMIT;
