-- DOWN for 20261009120000_awaiting_speakers (WP-BACKEND-07). NOT run by Prisma.
--
-- Returns the schema to its state after 20261008120000_meeting_workspace_not_null, from a fully
-- or partially applied run (Prisma does not wrap migration.sql in a transaction):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f api/prisma/migrations/20261009120000_awaiting_speakers/down.sql
--   pnpm --filter @transcrib/api run db:migrate:deploy        # re-apply (or deploy the previous code)
-- Runbook: .tl/deploy-plan.md §5. One transaction, idempotent.
--
-- IRREVERSIBLE PART: Postgres cannot drop an enum value, so MeetingStatus is recreated without
-- AWAITING_SPEAKERS (only meetings.status uses it). Refuses (and changes nothing) while a
-- meeting is in AWAITING_SPEAKERS — the old schema has no such status; move it first.
-- Lost: transcripts.speaker_mapping / speakers_confirmed_at values (speaker_map is kept).

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "meetings" WHERE "status"::text = 'AWAITING_SPEAKERS') THEN
    RAISE EXCEPTION 'down.sql: meetings in AWAITING_SPEAKERS exist; the old schema has no such status — resolve them first';
  END IF;
END $$;

ALTER TABLE "transcripts" DROP COLUMN IF EXISTS "speaker_mapping";
ALTER TABLE "transcripts" DROP COLUMN IF EXISTS "speakers_confirmed_at";

ALTER TYPE "MeetingStatus" RENAME TO "MeetingStatus_old";
CREATE TYPE "MeetingStatus" AS ENUM ('CREATED', 'UPLOADING', 'UPLOADED', 'AWAITING_START', 'TRANSCRIBING',
  'TRANSCRIBED', 'GENERATING_PROTOCOL', 'PROTOCOL_READY', 'FAILED', 'EDITED');
ALTER TABLE "meetings" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "meetings" ALTER COLUMN "status" TYPE "MeetingStatus" USING "status"::text::"MeetingStatus";
ALTER TABLE "meetings" ALTER COLUMN "status" SET DEFAULT 'CREATED';
DROP TYPE "MeetingStatus_old";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261009120000_awaiting_speakers';

COMMIT;
