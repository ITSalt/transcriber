-- DOWN for 20261009130000_drop_speaker_count (WP-BACKEND-08). NOT run by Prisma.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f api/prisma/migrations/20261009130000_drop_speaker_count/down.sql
--   pnpm --filter @transcrib/api run db:migrate:deploy        # re-apply (or deploy the previous code)
-- Runbook: .tl/deploy-plan.md §5. One transaction, idempotent. Lost: the dropped values (all were unused).
BEGIN;
ALTER TABLE "transcription_jobs" ADD COLUMN IF NOT EXISTS "speaker_count" INTEGER;
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261009130000_drop_speaker_count';
COMMIT;
