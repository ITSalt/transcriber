-- DOWN for 20261007120000_program_product_schema (WP-BACKEND-06). NOT run by Prisma —
-- Prisma only executes migration.sql; this file is for the operator.
--
-- Why it exists: `prisma migrate deploy` runs migration.sql WITHOUT a transaction. If it
-- fails midway, the objects created so far stay and the migration is marked failed; then
-- `prisma migrate resolve --rolled-back` + retry fails with `type "ParticipantSide" already
-- exists`. This script returns the database to the exact pre-migration schema (verified:
-- no drift against the previous schema.prisma) from a FULLY or PARTIALLY applied state, so
-- the migration can be applied again. Runbook: .tl/deploy-plan.md §5 Rollback model.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f api/prisma/migrations/20261007120000_program_product_schema/down.sql
--   pnpm --filter @transcrib/api run db:migrate:deploy      # re-apply (or deploy the old code)
--
-- Atomic (one transaction) and idempotent (IF EXISTS everywhere). Keeps every meeting,
-- recording, transcript, job and protocol row and their statuses. Loses ONLY data of the
-- program tables (users, workspaces, projects, contexts, versions, feedback, outbox) —
-- before the consumer packages ship they hold nothing but the backfills.
-- Refuses (and changes nothing) if a meeting is already in AWAITING_START: that status
-- does not exist in the old schema — move such meetings to another status first.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "meetings" WHERE "status"::text = 'AWAITING_START') THEN
    RAISE EXCEPTION 'down.sql: meetings in AWAITING_START exist; the old schema has no such status — resolve them first';
  END IF;
END $$;

ALTER TABLE "meetings" DROP CONSTRAINT IF EXISTS "meetings_workspace_id_fkey";
ALTER TABLE "meetings" DROP CONSTRAINT IF EXISTS "meetings_project_id_fkey";
DROP INDEX IF EXISTS "idx_meetings_workspace_created";
DROP INDEX IF EXISTS "idx_meetings_project_created";
ALTER TABLE "meetings" DROP COLUMN IF EXISTS "workspace_id";
ALTER TABLE "meetings" DROP COLUMN IF EXISTS "project_id";

DROP TABLE IF EXISTS "protocol_feedback", "protocol_versions", "protocol_generations", "meeting_contexts",
  "glossary_terms", "project_participants", "projects", "login_blocks", "auth_sessions", "memberships",
  "workspaces", "users", "graph_outbox" CASCADE;

DROP TYPE IF EXISTS "ProtocolFeedbackCategory", "ProtocolFeedbackKind", "ProtocolVersionKind",
  "ProtocolGenerationKind", "MeetingType", "ParticipantSide";

-- Postgres cannot drop an enum value: recreate MeetingStatus in its pre-migration form
-- (init + ADD VALUE 'EDITED' + RENAME 'ERROR' → 'FAILED'). Only meetings.status uses it.
-- Harmless when the migration failed before its ADD VALUE.
ALTER TYPE "MeetingStatus" RENAME TO "MeetingStatus_old";
CREATE TYPE "MeetingStatus" AS ENUM ('CREATED', 'UPLOADING', 'UPLOADED', 'TRANSCRIBING', 'TRANSCRIBED',
  'GENERATING_PROTOCOL', 'PROTOCOL_READY', 'FAILED', 'EDITED');
ALTER TABLE "meetings" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "meetings" ALTER COLUMN "status" TYPE "MeetingStatus" USING "status"::text::"MeetingStatus";
ALTER TABLE "meetings" ALTER COLUMN "status" SET DEFAULT 'CREATED';
DROP TYPE "MeetingStatus_old";

-- Forget the (failed or applied) migration so `migrate deploy` applies it again;
-- no `prisma migrate resolve` needed afterwards.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261007120000_program_product_schema';

COMMIT;
