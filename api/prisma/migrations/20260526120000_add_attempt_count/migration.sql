-- TECH-026: Add attempt_count to TranscriptionJob (ent-003 / TranscriptionJob-A08)
-- and ProtocolGenerationJob (ent-005 / ProtocolGenerationJob-A09).
-- Part of FR-001 (Worker Job Retry Resilience). Default 0 ensures safe backfill.

-- Step 1: Add attempt_count to transcription_jobs (non-nullable, default 0; backfills existing rows)
ALTER TABLE "transcription_jobs" ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;

-- Step 2: Add attempt_count to protocol_generation_jobs (non-nullable, default 0; backfills existing rows)
ALTER TABLE "protocol_generation_jobs" ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;
