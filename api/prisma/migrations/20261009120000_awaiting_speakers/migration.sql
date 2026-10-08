-- Migration: speaker confirmation (WP-BACKEND-07, FR-004, D-38)
--
-- 1. MeetingStatus += AWAITING_SPEAKERS (recognised, waiting for the author's confirmation).
-- 2. transcripts.speaker_mapping: the confirmation request as sent (with participant ids).
-- 3. transcripts.speakers_confirmed_at: when it was confirmed or skipped.
-- Prisma runs this file WITHOUT a transaction; on failure use down.sql (deploy-plan §5).

-- AlterEnum
ALTER TYPE "MeetingStatus" ADD VALUE IF NOT EXISTS 'AWAITING_SPEAKERS' BEFORE 'GENERATING_PROTOCOL';

-- AlterTable
ALTER TABLE "transcripts" ADD COLUMN IF NOT EXISTS "speaker_mapping" JSONB;
ALTER TABLE "transcripts" ADD COLUMN IF NOT EXISTS "speakers_confirmed_at" TIMESTAMP(3);
