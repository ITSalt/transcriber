-- Migration: program "product" schema v1 (WP-BACKEND-06 — contract package)
-- Spec: FR-003 (login, workspaces), FR-004 (projects, meeting context), FR-005 (protocol
--       versions, feedback), FR-006 (project memory outbox); D-3, D-6, D-7, D-15.
--
-- STRICTLY ADDITIVE. deploy-production.yml runs `migrate deploy` BEFORE `pm2 delete/start`,
-- so the pre-program api/worker keep running on this schema for a while — and, since this
-- package changes no runtime behaviour, until the consumer packages ship:
--   * only new enum types, new tables, new NULLABLE columns on "meetings", new indexes;
--   * the new MeetingStatus value AWAITING_START is never written by the old code;
--   * every FK from a new table to "meetings" is ON DELETE CASCADE, so the old UC-003
--     delete keeps working;
--   * meetings.workspace_id carries a DB DEFAULT = the fixed id of the legacy workspace
--     «Роман», so rows the old code inserts (it never sets the column) still get an owner.
--     WP-BACKEND-01 drops that default and sets NOT NULL.
-- Old Prisma clients select columns explicitly, so extra columns are invisible to them.
--
-- Backfills (D-7, FR-005):
--   1. workspace «Роман» (personal, fixed id) — every existing meeting is assigned to it;
--   2. every existing protocol becomes ProtocolVersion n=1:
--      LEGACY when it had been edited (edit_count > 0, the generated original is gone),
--      GENERATED otherwise.
-- Both backfills are idempotent (ON CONFLICT / IS NULL guards), so a consumer migration may
-- safely re-run them for rows the old code wrote after this migration.

-- CreateEnum
CREATE TYPE "ParticipantSide" AS ENUM ('OURS', 'CLIENT', 'CONTRACTOR', 'OTHER');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('NEGOTIATION', 'STATUS', 'PLANNING', 'INTERVIEW', 'OTHER');

-- CreateEnum
CREATE TYPE "ProtocolGenerationKind" AS ENUM ('PROTOCOL', 'MEMORY_EXTRACT', 'MEMORY_RESOLVE', 'MEMORY_SUMMARY');

-- CreateEnum
CREATE TYPE "ProtocolVersionKind" AS ENUM ('GENERATED', 'USER_EDIT', 'LEGACY');

-- CreateEnum
CREATE TYPE "ProtocolFeedbackKind" AS ENUM ('COMMENT', 'CORRECTED_PROTOCOL', 'DOCX_REVIEW');

-- CreateEnum
CREATE TYPE "ProtocolFeedbackCategory" AS ENUM ('SPEAKER_ATTRIBUTION', 'MISSED_DECISION', 'WRONG_TASK', 'FABRICATED', 'TERMS_NAMES', 'STYLE', 'OTHER');

-- AlterEnum
ALTER TYPE "MeetingStatus" ADD VALUE 'AWAITING_START' BEFORE 'TRANSCRIBING';

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "project_id" UUID,
ADD COLUMN     "workspace_id" UUID DEFAULT '00000000-0000-4000-8000-000000000001'::uuid;

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "pin_lookup" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "personal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_blocks" (
    "id" UUID NOT NULL,
    "client_key" TEXT NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "blocked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_participants" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "role" TEXT,
    "organization" TEXT,
    "side" "ParticipantSide" NOT NULL DEFAULT 'OTHER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glossary_terms" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "term" TEXT NOT NULL,
    "variants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "definition" TEXT,
    "asr_keyterm" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "glossary_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_contexts" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "meeting_type" "MeetingType",
    "goal" TEXT,
    "agenda" TEXT,
    "participants" JSONB NOT NULL DEFAULT '[]',
    "glossary" JSONB NOT NULL DEFAULT '[]',
    "previous_protocol" JSONB NOT NULL DEFAULT '{"source":"none"}',
    "notes" TEXT,
    "snapshot_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_generations" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "kind" "ProtocolGenerationKind" NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "context_snapshot_hash" TEXT,
    "keyterms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "asr_options" JSONB,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "prompt_uri" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_versions" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "n" INTEGER NOT NULL,
    "kind" "ProtocolVersionKind" NOT NULL,
    "markdown" TEXT NOT NULL,
    "author_user_id" UUID,
    "generation_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_feedback" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "protocol_version_n" INTEGER NOT NULL,
    "kind" "ProtocolFeedbackKind" NOT NULL,
    "category" "ProtocolFeedbackCategory",
    "text" TEXT,
    "file_uri" TEXT,
    "file_name" TEXT,
    "mime" TEXT,
    "size_bytes" BIGINT,
    "extracted" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_outbox" (
    "id" UUID NOT NULL,
    "op" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMP(3),

    CONSTRAINT "graph_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_pin_lookup_key" ON "users"("pin_lookup");

-- CreateIndex
CREATE INDEX "idx_memberships_workspace" ON "memberships"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_workspace_id_key" ON "memberships"("user_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "idx_auth_sessions_user" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "login_blocks_client_key_key" ON "login_blocks"("client_key");

-- CreateIndex
CREATE INDEX "idx_projects_workspace_created" ON "projects"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_project_participants_project" ON "project_participants"("project_id");

-- CreateIndex
CREATE INDEX "idx_glossary_terms_project" ON "glossary_terms"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_contexts_meeting_id_key" ON "meeting_contexts"("meeting_id");

-- CreateIndex
CREATE INDEX "idx_protocol_generations_meeting_created" ON "protocol_generations"("meeting_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_versions_meeting_id_n_key" ON "protocol_versions"("meeting_id", "n");

-- CreateIndex
CREATE INDEX "idx_protocol_feedback_meeting_created" ON "protocol_feedback"("meeting_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_protocol_feedback_workspace_created" ON "protocol_feedback"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_graph_outbox_pending" ON "graph_outbox"("done_at", "created_at");

-- CreateIndex
CREATE INDEX "idx_meetings_workspace_created" ON "meetings"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_meetings_project_created" ON "meetings"("project_id", "created_at");

-- Backfill 1 (D-7): the legacy personal workspace «Роман» with a fixed, well-known id
-- (shared LEGACY_WORKSPACE_ID). Must exist before meetings_workspace_id_fkey is validated.
INSERT INTO "workspaces" ("id", "name", "personal", "created_at")
VALUES ('00000000-0000-4000-8000-000000000001'::uuid, 'Роман', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ADD COLUMN ... DEFAULT <constant> already filled existing rows (PG 11+, no table rewrite);
-- the explicit UPDATE keeps the backfill correct even if that ever changes.
UPDATE "meetings"
SET "workspace_id" = '00000000-0000-4000-8000-000000000001'::uuid
WHERE "workspace_id" IS NULL;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_contexts" ADD CONSTRAINT "meeting_contexts_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_generations" ADD CONSTRAINT "protocol_generations_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_versions" ADD CONSTRAINT "protocol_versions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_versions" ADD CONSTRAINT "protocol_versions_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_versions" ADD CONSTRAINT "protocol_versions_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "protocol_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_feedback" ADD CONSTRAINT "protocol_feedback_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_feedback" ADD CONSTRAINT "protocol_feedback_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_feedback" ADD CONSTRAINT "protocol_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill 2 (FR-005): each existing protocol → version 1.
-- created_at = when the current text came to be (last edit, else generation).
INSERT INTO "protocol_versions" ("id", "meeting_id", "n", "kind", "markdown", "created_at")
SELECT gen_random_uuid(),
       p."meeting_id",
       1,
       (CASE WHEN p."edit_count" > 0 THEN 'LEGACY' ELSE 'GENERATED' END)::"ProtocolVersionKind",
       p."markdown_content",
       COALESCE(p."last_edited_at", p."generated_at")
FROM "protocols" p
ON CONFLICT ("meeting_id", "n") DO NOTHING;
