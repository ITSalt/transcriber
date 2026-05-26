-- Migration: rename MeetingStatus enum value ERROR → FAILED
-- Spec: ENUM-MeetingStatus order-7 is FAILED (not ERROR). L1 code-only fix.
-- Atomic rename — preserves all existing rows.
ALTER TYPE "MeetingStatus" RENAME VALUE 'ERROR' TO 'FAILED';
