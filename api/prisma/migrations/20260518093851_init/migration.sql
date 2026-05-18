-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('CREATED', 'UPLOADING', 'UPLOADED', 'TRANSCRIBING', 'TRANSCRIBED', 'GENERATING_PROTOCOL', 'PROTOCOL_READY', 'ERROR');

-- CreateEnum
CREATE TYPE "MeetingLanguage" AS ENUM ('RU', 'EN', 'AUTO');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "VideoMimeType" AS ENUM ('VIDEO_MP4', 'VIDEO_WEBM', 'VIDEO_MOV', 'VIDEO_AVI', 'VIDEO_MKV');

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'CREATED',
    "language" "MeetingLanguage" NOT NULL DEFAULT 'AUTO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "storage_uri" TEXT NOT NULL,
    "mime_type" "VideoMimeType" NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "duration_sec" DOUBLE PRECISION,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcription_jobs" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error_msg" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcription_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "speaker_map" JSONB NOT NULL DEFAULT '{}',
    "segments_blob" JSONB NOT NULL DEFAULT '[]',
    "raw_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocol_generation_jobs" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error_msg" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocol_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protocols" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "content_md" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocols_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recordings_meeting_id_key" ON "recordings"("meeting_id");

-- CreateIndex
CREATE UNIQUE INDEX "transcription_jobs_meeting_id_key" ON "transcription_jobs"("meeting_id");

-- CreateIndex
CREATE INDEX "idx_transcription_jobs_meeting_status" ON "transcription_jobs"("meeting_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_meeting_id_key" ON "transcripts"("meeting_id");

-- CreateIndex
CREATE UNIQUE INDEX "protocol_generation_jobs_meeting_id_key" ON "protocol_generation_jobs"("meeting_id");

-- CreateIndex
CREATE INDEX "idx_protocol_gen_jobs_meeting_status" ON "protocol_generation_jobs"("meeting_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "protocols_meeting_id_key" ON "protocols"("meeting_id");

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcription_jobs" ADD CONSTRAINT "transcription_jobs_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocol_generation_jobs" ADD CONSTRAINT "protocol_generation_jobs_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
