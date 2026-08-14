-- Migration: persist the ASR-detected recording language on Transcript
-- Spec: RQ-018 / BRQ-005 (hard). Transcript-A06 was marked derived:true ("not persisted")
--       in the graph, contradicting BRQ-005 which requires the detected value to be
--       recorded on Transcript.language. The column never existed, so the worker computed
--       the detected language and only logged it. L2 fix, DEC-003.
--
-- Nullable with no default -> instant ADD COLUMN, no table rewrite. Safe for the
-- still-running old api/worker processes: deploy-production.yml applies migrations
-- BEFORE `pm2 delete/start`, and an unknown extra column is ignored by the old client.
ALTER TABLE "transcripts" ADD COLUMN "language" "MeetingLanguage";

-- Backfill: where the author declared a language, that IS the language of the recording.
-- Rows whose meeting is AUTO are deliberately left NULL: the ASR responses were never
-- persisted, so there is no ground truth to recover, and guessing would put a fabricated
-- value into a column whose whole purpose is to record what the provider actually reported.
UPDATE "transcripts" t
SET "language" = m."language"
FROM "meetings" m
WHERE t."meeting_id" = m."id"
  AND m."language" <> 'AUTO'
  AND t."language" IS NULL;
