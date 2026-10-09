-- WP-BACKEND-08 (D-43): the speaker-count hint is gone from the product; nothing reads the column.
ALTER TABLE "transcription_jobs" DROP COLUMN IF EXISTS "speaker_count";
