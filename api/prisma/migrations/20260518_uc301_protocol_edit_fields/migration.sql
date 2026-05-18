-- UC-301-BE: Add EDITED to MeetingStatus enum, add edit_count / last_edited_at / generated_at
-- to protocols, and rename content_md -> markdown_content.
-- Addresses TECH-004 -> TECH-003 drift flagged in UC-301-BE task spec.

-- Step 1: Add EDITED value to MeetingStatus enum
ALTER TYPE "MeetingStatus" ADD VALUE 'EDITED';

-- Step 2: Rename content_md -> markdown_content in protocols table
ALTER TABLE "protocols" RENAME COLUMN "content_md" TO "markdown_content";

-- Step 3: Add edit_count column (non-nullable, default 0)
ALTER TABLE "protocols" ADD COLUMN "edit_count" INTEGER NOT NULL DEFAULT 0;

-- Step 4: Add generated_at column (non-nullable with default now(); backfill with created_at)
ALTER TABLE "protocols" ADD COLUMN "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Step 5: Add last_edited_at column (nullable)
ALTER TABLE "protocols" ADD COLUMN "last_edited_at" TIMESTAMP(3);
