"""
Generate all .tl/tasks/* files from embedded SA-layer data.
One-shot generator invoked by /nacl-tl-plan.

Data is mirrored from Neo4j SA layer (read once at planning time).
Re-run /nacl-tl-plan to regenerate; do not hand-edit individual files.
"""

from __future__ import annotations
from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parent.parent / "tasks"
ROOT.mkdir(parents=True, exist_ok=True)

# =========================================================================
# REFERENCE DATA (embedded from Neo4j SA layer)
# =========================================================================

PROJECT_NAME = "Transcrib"
GENERATED_AT = "2026-05-18"

# Domain entities ----------------------------------------------------------
ENTITIES = {
    "Meeting": {
        "module": "mod-common",
        "desc": "Root aggregate per meeting. Owns Recording/Transcript/Protocol refs and tracks overall pipeline status.",
        "attrs": [
            ("id", "UUID", False, True, "Surrogate PK"),
            ("title", "String", True, False, "Optional user-readable title; defaults to filename"),
            ("language", "Enum(MeetingLanguage)", True, False, "RU/EN or null pending auto-detect (BRQ-005)"),
            ("status", "Enum(MeetingStatus)", False, False, "Pipeline-mirror status (BRQ-008); drives UI gating"),
            ("uploaded_at", "DateTime", False, True, "Upload init timestamp; immutable"),
            ("updated_at", "DateTime", False, True, "Last status transition or protocol edit; used for catalog sort"),
        ],
    },
    "Recording": {
        "module": "mod-ingest",
        "desc": "Uploaded video metadata; physical bytes in EXT-04 Object Storage (s3://).",
        "attrs": [
            ("id", "UUID", False, True, "Surrogate PK"),
            ("meeting_id", "Reference->Meeting", False, True, "FK to owning Meeting"),
            ("filename", "String", False, False, "Original filename supplied at upload"),
            ("size_bytes", "Int", False, False, "Size in bytes; MUST be <= 524288000 (500 MB) per BRQ-001"),
            ("mime_type", "Enum(VideoMimeType)", False, False, "Container MIME (MP4/MKV/MOV per BRQ-002)"),
            ("duration_sec", "Int", True, False, "Video duration; null until extracted in BP-002"),
            ("storage_path", "String", False, True, "Object key in EXT-04 (s3://bucket/key)"),
            ("uploaded_at", "DateTime", False, True, "Upload-completed timestamp; immutable"),
        ],
    },
    "TranscriptionJob": {
        "module": "mod-transcription",
        "desc": "Async job tracking ASR+diarization for a Recording.",
        "attrs": [
            ("id", "UUID", False, True, "Surrogate PK"),
            ("meeting_id", "Reference->Meeting", False, True, "FK to Meeting"),
            ("recording_id", "Reference->Recording", False, True, "FK to Recording (1:1 per BRQ-006)"),
            ("status", "Enum(JobStatus)", False, True, "QUEUED->IN_PROGRESS->{COMPLETED|FAILED}; terminal immutable (BRQ-009)"),
            ("started_at", "DateTime", True, True, "Worker pickup time"),
            ("completed_at", "DateTime", True, True, "Terminal state time"),
            ("error_reason", "String", True, True, "Non-null when status=FAILED (BRQ-010)"),
        ],
    },
    "Transcript": {
        "module": "mod-transcription",
        "desc": "Verbatim speaker-attributed transcript from ASR+diarization. 1:1 with Meeting.",
        "attrs": [
            ("id", "UUID", False, True, "Surrogate PK"),
            ("meeting_id", "Reference->Meeting", False, True, "FK to Meeting (composition; deleted with Meeting)"),
            ("full_text", "String", False, False, "Markdown/text with per-segment speaker labels + minute:second timestamps"),
            ("segments_count", "Int", False, False, "Total speaker-attributed segments"),
            ("speakers_count", "Int", False, False, "Distinct speakers detected"),
            ("language", "Enum(MeetingLanguage)", False, False, "Detected or confirmed language (RU/EN)"),
            ("speaker_map", "JSON", True, False, '{"Speaker 1": "Ivan", "Speaker 2": null} per BRQ-021'),
            ("created_at", "DateTime", False, True, "First-persisted time"),
        ],
    },
    "ProtocolGenerationJob": {
        "module": "mod-protocol",
        "desc": "Async job tracking LLM protocol generation. Auto-created on transcription COMPLETED (BRQ-007).",
        "attrs": [
            ("id", "UUID", False, True, "Surrogate PK"),
            ("meeting_id", "Reference->Meeting", False, True, "FK to Meeting"),
            ("transcript_id", "Reference->Transcript", False, True, "FK to source Transcript (1:1 per BRQ-007)"),
            ("status", "Enum(JobStatus)", False, True, "QUEUED->IN_PROGRESS->{COMPLETED|FAILED}; terminal immutable (BRQ-009)"),
            ("started_at", "DateTime", True, True, "Worker pickup time"),
            ("completed_at", "DateTime", True, True, "Terminal state time"),
            ("prompt_template_version", "String", False, True, "LLM prompt template version used (audit)"),
            ("error_reason", "String", True, True, "Non-null when status=FAILED (BRQ-010)"),
        ],
    },
    "Protocol": {
        "module": "mod-protocol",
        "desc": "Persisted Markdown protocol with four required sections (BRQ-011). 1:1 with Meeting.",
        "attrs": [
            ("id", "UUID", False, True, "Surrogate PK"),
            ("meeting_id", "Reference->Meeting", False, True, "FK to Meeting (composition)"),
            ("markdown_content", "String", False, False, "Canonical Markdown (BRQ-018); MUST contain Participants/Discussion Topics/Decisions/Action Items (BRQ-011)"),
            ("version", "Int", False, False, "Monotonic; starts at 1; +1 each save (BRQ-014)"),
            ("edit_count", "Int", False, False, "Manual saves since generation; starts 0 (BRQ-015)"),
            ("generated_at", "DateTime", False, True, "First-generation time; immutable"),
            ("last_edited_at", "DateTime", True, True, "Last manual save; null until first edit"),
        ],
    },
}

# Enums --------------------------------------------------------------------
ENUMS = {
    "MeetingStatus": [
        ("UPLOADING", "File upload in progress"),
        ("TRANSCRIBING", "Transcription queued or running"),
        ("TRANSCRIPT_READY", "Transcript persisted; protocol not yet started or running"),
        ("PROTOCOL_GENERATING", "Protocol-gen job queued or running"),
        ("PROTOCOL_READY", "Protocol persisted; no manual edits yet"),
        ("EDITED", "Protocol manually edited at least once"),
        ("FAILED", "Non-recoverable pipeline error (terminal, BRQ-009)"),
    ],
    "MeetingLanguage": [
        ("RU", "Russian"),
        ("EN", "English"),
    ],
    "JobStatus": [
        ("QUEUED", "Waiting for worker"),
        ("IN_PROGRESS", "Worker running"),
        ("COMPLETED", "Terminal success; immutable (BRQ-009)"),
        ("FAILED", "Terminal failure; error_reason set (BRQ-010); immutable (BRQ-009)"),
    ],
    "VideoMimeType": [
        ("video/mp4", "MP4 container"),
        ("video/x-matroska", "MKV container"),
        ("video/quicktime", "MOV container"),
    ],
}

# Roles --------------------------------------------------------------------
ROLES = {
    "AUTHOR": {
        "type": "internal (human)",
        "desc": "End-user who uploads a recording and owns derived artifacts. Sole active human role at MVP.",
        "perms": [
            ("Meeting", "CRUD", "own"),
            ("Recording", "CRD", "own; update is system-only"),
            ("Transcript", "RD", "own; content produced by SYSTEM"),
            ("Protocol", "RUD", "own; initial generation by SYSTEM"),
            ("TranscriptionJob", "R", "own"),
            ("ProtocolGenerationJob", "R", "own"),
        ],
    },
    "SYSTEM": {
        "type": "internal (background workers)",
        "desc": "Pipeline machinery. Owns job lifecycles; writes Meeting.status per BRQ-008.",
        "perms": [
            ("Recording", "R", "all"),
            ("Transcript", "C", "all"),
            ("Protocol", "C", "all (initial creation)"),
            ("TranscriptionJob", "CRUD", "all"),
            ("ProtocolGenerationJob", "CRUD", "all"),
            ("Meeting", "RU", "all (status mirror per BRQ-008)"),
        ],
    },
}

# TECH tasks ---------------------------------------------------------------
TECH = [
    {
        "id": "TECH-001", "wave": 0,
        "title": "Monorepo & tooling",
        "deps": [],
        "what": "Bootstrap pnpm workspace with packages: api/, worker/, web/, shared/. Configure root tsconfig (project references), eslint, prettier, vitest, and a Makefile / npm scripts for common dev tasks.",
        "deliverables": [
            "pnpm-workspace.yaml lists api/, worker/, web/, shared/",
            "package.json scripts: dev, build, test, lint, typecheck",
            "Root tsconfig.base.json with strict mode + path aliases for @transcrib/shared",
            "ESLint flat config + Prettier config shared across packages",
            "Vitest root config that aggregates package-level test runs",
        ],
        "tests": [
            "pnpm install resolves without errors",
            "pnpm typecheck passes (empty packages)",
            "pnpm lint passes (no source yet)",
        ],
        "steps": [
            "1. Initialize root package.json with pnpm workspace + scripts.",
            "2. Create pnpm-workspace.yaml with package globs.",
            "3. Add tsconfig.base.json + per-package tsconfig.json with project refs.",
            "4. Configure eslint (typescript-eslint), prettier, vitest at root.",
            "5. Add .editorconfig, .nvmrc (Node 20).",
            "6. Verify pnpm install + pnpm typecheck pass.",
        ],
    },
    {
        "id": "TECH-002", "wave": 0,
        "title": "Docker Compose dev stack",
        "deps": ["TECH-001"],
        "what": "Stand up the local dev infra: Postgres 16, Redis 7, MinIO. Reuse existing transcrib-neo4j container (already running for skills).",
        "deliverables": [
            "docker-compose.yml at repo root with services: postgres, redis, minio (and named volumes)",
            "MinIO console exposed on host (default :9001); buckets auto-created via initContainer / mc",
            ".env.example documenting DATABASE_URL, REDIS_URL, S3_ENDPOINT/S3_KEY/S3_SECRET/S3_BUCKET",
            "make dev-up / make dev-down scripts",
        ],
        "tests": [
            "docker compose up -d brings all services healthy within 60s",
            "psql DATABASE_URL -c 'SELECT 1' returns 1",
            "redis-cli -u REDIS_URL PING returns PONG",
            "mc ls minio/transcrib lists the created bucket",
        ],
        "steps": [
            "1. Author docker-compose.yml (postgres:16, redis:7, minio/minio).",
            "2. Add minio-init init container running mc to mb the bucket.",
            "3. Mount named volumes for postgres/data and minio/data.",
            "4. Populate .env.example with all service URLs.",
            "5. Verify the full stack runs against a clean machine.",
        ],
    },
    {
        "id": "TECH-003", "wave": 0,
        "title": "Prisma schema & migrations",
        "deps": ["TECH-001", "TECH-002"],
        "what": "Define Prisma schema for the SA-layer entities, with enums and FK relationships per the domain model. Apply initial migration against the dev Postgres.",
        "deliverables": [
            "prisma/schema.prisma in api/ with models: Meeting, Recording, TranscriptionJob, Transcript, ProtocolGenerationJob, Protocol",
            "Enums: MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType",
            "Cascade deletes per RQ-006: Meeting deletion cascades to Recording/Transcript/Protocol/Jobs",
            "Composite indexes on (meeting_id, status) for jobs",
            "JSONB for Transcript.speaker_map and any segments_blob",
            "Initial migration applied; prisma generate produces @prisma/client",
        ],
        "tests": [
            "prisma migrate dev --create-only produces expected SQL",
            "prisma migrate deploy succeeds against dev Postgres",
            "Round-trip create+findFirst works for each entity (integration smoke)",
        ],
        "steps": [
            "1. Translate ENTITIES + ENUMS to Prisma schema (see acceptance.md for column list).",
            "2. Add @relation cascade deletes per RQ-006.",
            "3. Generate initial migration; review SQL.",
            "4. Apply migration; verify schema.",
            "5. Write a 1-line integration smoke test per entity.",
        ],
    },
    {
        "id": "TECH-004", "wave": 0,
        "title": "Shared Zod schemas, DTOs, enums",
        "deps": ["TECH-001"],
        "what": "Author Zod schemas for all DTOs and enums in shared/. Export inferred TS types for BE and FE consumption.",
        "deliverables": [
            "shared/src/enums.ts: MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType as z.enum + TS types",
            "shared/src/dto/*.ts: MeetingDto, RecordingDto, TranscriptDto, ProtocolDto, TranscriptionJobDto, ProtocolGenerationJobDto, MeetingListItem, etc.",
            "shared/src/api/*.ts: per-UC request/response Zod schemas (see api-contract.md files)",
            "shared/src/index.ts barrel re-exports",
        ],
        "tests": [
            "Zod schemas round-trip parse on a sample object",
            "TS compilation succeeds (tsc --noEmit) in shared/",
        ],
        "steps": [
            "1. Define enums.ts mirroring Prisma enums.",
            "2. Define entity DTOs as z.object schemas.",
            "3. Per-UC request/response schemas (see UC api-contract files).",
            "4. Barrel-export from shared/src/index.ts.",
        ],
    },
    {
        "id": "TECH-005", "wave": 0,
        "title": "Fastify API scaffold",
        "deps": ["TECH-001", "TECH-004"],
        "what": "Bootstrap Fastify 5 with fastify-type-provider-zod, structured error handler, Pino logger, request-id correlation, and /health endpoint.",
        "deliverables": [
            "api/src/server.ts wiring zod-type-provider, error handler, plugins",
            "api/src/plugins/logger.ts (Pino with redaction of credentials)",
            "api/src/plugins/errors.ts: maps thrown AppError -> JSON {code, message, details?} with HTTP status",
            "api/src/routes/health.ts -> GET /health returns {status:'ok', db:'ok', redis:'ok'} (probes both)",
            "api/src/config.ts loads env via Zod",
        ],
        "tests": [
            "GET /health returns 200 with all probes green",
            "Throwing AppError('VALIDATION_FAILED', 400, ...) yields JSON error body",
            "Invalid request body (zod fail) yields 400 with field-level details",
        ],
        "steps": [
            "1. Install fastify, fastify-type-provider-zod, pino, zod, dotenv.",
            "2. Author server bootstrap + config loader.",
            "3. Implement error handler + AppError class with stable code field.",
            "4. Add /health with concrete probes.",
        ],
    },
    {
        "id": "TECH-006", "wave": 0,
        "title": "BullMQ + worker process scaffold",
        "deps": ["TECH-002", "TECH-005"],
        "what": "Bootstrap BullMQ queues and a worker process. Define queue contract for transcriptionJob and protocolJob; wire to Redis from TECH-002.",
        "deliverables": [
            "worker/src/index.ts boots Worker instances for queues",
            "shared/src/queues.ts: QueueName enum, JobPayload Zod schemas",
            "api/src/queue.ts produces Queue instances and a `enqueue(name, payload)` helper",
            "Job concurrency = 1 per worker per NFR-009 (one video at a time)",
            "Failed-job handler logs error_reason and updates the corresponding DB job record",
        ],
        "tests": [
            "enqueue('transcriptionJob', {...}) -> worker receives, runs handler (echo handler at this stage)",
            "Worker handler throwing sets job to failed in Bull",
        ],
        "steps": [
            "1. Install bullmq.",
            "2. Define QueueName + payload schemas in shared/.",
            "3. Implement worker bootstrap with empty handlers (UC-200/UC-300 will fill).",
            "4. Implement enqueue helper in api/.",
        ],
    },
    {
        "id": "TECH-007", "wave": 0,
        "title": "S3/MinIO storage adapter",
        "deps": ["TECH-005"],
        "what": "Implement IStorage abstraction with putObject/getObjectStream/deleteObject. Adapter targets MinIO in dev, drop-in compatible with AWS S3/R2 via env (per ADR-004).",
        "deliverables": [
            "shared/src/storage/IStorage.ts contract",
            "api/src/storage/s3-adapter.ts (uses @aws-sdk/client-s3 against S3_ENDPOINT)",
            "All references use the s3://bucket/key URI shape (ADR-004)",
            "putObject supports multipart streaming for large uploads",
        ],
        "tests": [
            "Round trip: putObject(stream) then getObjectStream returns identical bytes",
            "deleteObject removes the key; subsequent get throws NotFound",
        ],
        "steps": [
            "1. Define IStorage interface in shared/.",
            "2. Implement s3-adapter against MinIO endpoint.",
            "3. Add s3:// URI utility for path manipulation.",
            "4. Wire bucket name + creds from config.",
        ],
    },
    {
        "id": "TECH-008", "wave": 0,
        "title": "TUS upload protocol wiring",
        "deps": ["TECH-005", "TECH-007"],
        "what": "Wire @tus/server on the Fastify API. Configured to stream chunks straight to S3 storage (TECH-007). Client-side helper in web/ uses tus-js-client.",
        "deliverables": [
            "api/src/plugins/tus.ts: mount @tus/server at /api/uploads with S3 datastore",
            "Upload metadata captured: filename, size_bytes, mime_type, meeting_id (passed via TUS Upload-Metadata header)",
            "Pre-create hook validates BRQ-001 (500 MB) + BRQ-002 (MIME) BEFORE accepting bytes",
            "On upload-finish hook fires a callback to UC-100-BE service (creates Meeting/Recording/TranscriptionJob)",
        ],
        "tests": [
            "TUS POST /api/uploads with valid Upload-Metadata returns 201 + Location",
            "Oversized file (>500 MB declared) rejected at pre-create with 413",
            "Wrong MIME rejected with 415",
        ],
        "steps": [
            "1. Install @tus/server, @tus/s3-store.",
            "2. Configure datastore against S3 (TECH-007).",
            "3. Wire pre-create + on-finish hooks.",
            "4. Validate hook signatures against tests.",
        ],
    },
    {
        "id": "TECH-009", "wave": 0,
        "title": "ffmpeg audio extraction utility",
        "deps": ["TECH-006"],
        "what": "Provide an extractAudio(inputStream) -> AudioStream + durationSec helper in worker/. Uses fluent-ffmpeg; probes container integrity (BRQ-003) and reads duration.",
        "deliverables": [
            "worker/src/lib/ffmpeg.ts: extractAudio + probeContainer",
            "Outputs 16 kHz mono PCM/WAV stream suitable for Deepgram input",
            "probeContainer returns {durationSec, isValid} from ffprobe metadata",
        ],
        "tests": [
            "extractAudio on a known-good sample MP4 yields a non-empty stream + positive duration",
            "probeContainer on a corrupted file returns {isValid: false}",
        ],
        "steps": [
            "1. Install fluent-ffmpeg + ensure ffmpeg binary in Docker worker image.",
            "2. Implement probeContainer using ffprobe.",
            "3. Implement extractAudio piping output.",
            "4. Test against sample fixtures.",
        ],
    },
    {
        "id": "TECH-010", "wave": 0,
        "title": "IAsrProvider + Deepgram Nova-3 adapter",
        "deps": ["TECH-006"],
        "what": "Define IAsrProvider abstraction (ADR-006) in shared/. Implement DeepgramAsrProvider against Deepgram Nova-3 with diarization + RU/EN.",
        "deliverables": [
            "shared/src/asr/IAsrProvider.ts: transcribe({audio, languageHint?}) -> AsrResult{segments[], detectedLanguage, speakers[]}",
            "worker/src/asr/deepgram.ts implements provider via @deepgram/sdk",
            "Provider reads DEEPGRAM_API_KEY from env",
            "Detects language when languageHint is null per BRQ-005",
        ],
        "tests": [
            "transcribe on a sample EN audio fixture returns segments with speaker labels and non-empty text",
            "languageHint=null sets detectedLanguage on result",
        ],
        "steps": [
            "1. Define IAsrProvider in shared/.",
            "2. Install @deepgram/sdk.",
            "3. Implement Deepgram adapter with diarize=true, smart_format=true.",
            "4. Map Deepgram response to AsrResult.",
        ],
    },
    {
        "id": "TECH-011", "wave": 0,
        "title": "ILlmProvider + kie.ai adapter",
        "deps": ["TECH-006"],
        "what": "Define ILlmProvider abstraction (ADR-007) in shared/. Implement KieAiLlmProvider supporting Claude Sonnet 4.6 (default) and GPT-5.4 selectable per meeting.",
        "deliverables": [
            "shared/src/llm/ILlmProvider.ts: generate({prompt, model?, language}) -> LlmResult{text, model, tokensIn, tokensOut}",
            "worker/src/llm/kieai.ts implements provider via kie.ai HTTP API",
            "Provider reads KIE_API_KEY from env",
            "Model defaults to 'claude-sonnet-4-6'; per-call override accepted",
            "Prompt templates in worker/src/llm/prompts/{ru,en}/protocol.md (RU + EN per BRQ-013)",
        ],
        "tests": [
            "generate({prompt:'test', language:'EN'}) returns non-empty text",
            "Switching model='gpt-5-4' routes to GPT endpoint",
        ],
        "steps": [
            "1. Define ILlmProvider in shared/.",
            "2. Implement kie.ai HTTP adapter.",
            "3. Author EN + RU prompt templates with the four required sections (BRQ-011).",
            "4. Add model selection logic + version tracking.",
        ],
    },
    {
        "id": "TECH-012", "wave": 0,
        "title": "SSE event stream",
        "deps": ["TECH-005"],
        "what": "Implement GET /api/meetings/:id/events as a Server-Sent Events stream that emits Meeting.status transitions and current job progress (per ADR-010). Used by UC-001 catalog auto-refresh and UC-100/200/300 progress views.",
        "deliverables": [
            "api/src/routes/events.ts: SSE handler via Fastify reply.raw stream",
            "Pub/sub backed by Redis (worker -> publish, API -> subscribe) so transitions propagate across processes",
            "Event payload: {type:'meeting.status', meeting_id, status, error_reason?}",
            "Heartbeat ping every 15s",
            "Disconnect cleanup",
        ],
        "tests": [
            "SSE connection receives a status event when worker updates Meeting.status",
            "Stream sends heartbeat pings at the configured interval",
        ],
        "steps": [
            "1. Add Redis pub/sub helpers in shared/.",
            "2. Worker publishes on Meeting.status transitions.",
            "3. API endpoint subscribes per meeting + streams events.",
            "4. Test full pub-sub round trip.",
        ],
    },
    {
        "id": "TECH-013", "wave": 0,
        "title": "Web scaffold (Vite + React 19 + shadcn + Tailwind + TanStack Query + Router + i18next)",
        "deps": ["TECH-001", "TECH-004"],
        "what": "Bootstrap web/ with Vite 5, React 19, TypeScript, shadcn/ui, Tailwind CSS, TanStack Query v5, React Router 7, i18next (RU+EN).",
        "deliverables": [
            "web/vite.config.ts with React + TS",
            "web/src/main.tsx mounts <App/> with QueryClientProvider + RouterProvider + i18next provider",
            "web/src/routes/* shell (catalog, detail, upload, transcript, protocol) as empty stubs",
            "web/src/lib/api.ts: typed fetch wrapper consuming Zod schemas from shared/",
            "shadcn components installed: Button, Card, Dialog, Input, Select, Toast, Table, Progress, Badge, Textarea",
            "i18n keys for RU + EN at web/src/i18n/{ru,en}.json",
            "Tailwind configured with shadcn theme + design tokens",
        ],
        "tests": [
            "pnpm --filter web dev starts dev server",
            "pnpm --filter web build produces a valid bundle",
            "Visiting /catalog renders empty page without console errors",
        ],
        "steps": [
            "1. Scaffold Vite + React 19 + TS in web/.",
            "2. Install shadcn/ui + tailwind; init theme.",
            "3. Add TanStack Query client + React Router routes.",
            "4. Add i18next with RU/EN bundles; wire LanguageSwitcher.",
            "5. Author api fetch wrapper using shared Zod types.",
        ],
    },
    {
        "id": "TECH-014", "wave": 0,
        "title": "Puppeteer PDF renderer",
        "deps": ["TECH-005"],
        "what": "Implement renderPdf(markdown, meta) -> Buffer that converts Markdown to PDF via Puppeteer. Output is transient: NEVER persisted (BRQ-017).",
        "deliverables": [
            "api/src/lib/pdf.ts: renderPdf({markdown, meta:{title, version}}) -> Buffer",
            "Uses headless Chromium; HTML template at api/src/lib/pdf/template.html with section styles for the four BRQ-011 sections",
            "Markdown rendered to HTML via remark/rehype before passing to Puppeteer",
            "Puppeteer launched in single-shot mode (close browser after each render)",
        ],
        "tests": [
            "renderPdf(sampleMarkdown) returns a non-empty Buffer whose first bytes match %PDF-",
            "Output PDF contains all four required section headers (Participants, Discussion Topics, Decisions, Action Items)",
        ],
        "steps": [
            "1. Install puppeteer, remark, rehype, rehype-stringify.",
            "2. Author HTML template.",
            "3. Render markdown -> HTML -> PDF.",
            "4. Test with sample protocol fixtures.",
        ],
    },
    {
        "id": "TECH-015", "wave": 0,
        "title": "GitHub Actions CI",
        "deps": ["TECH-001"],
        "what": "Author CI workflow: install -> lint -> typecheck -> test -> build for all packages on PR/push.",
        "deliverables": [
            ".github/workflows/ci.yml with matrix per package (api, worker, web, shared)",
            "Cache pnpm store + node_modules",
            "Postgres + Redis service containers for integration tests",
            "Job names mapped to required checks (visible on PRs)",
        ],
        "tests": [
            "PR opened triggers ci.yml",
            "All jobs complete green on the initial commit",
        ],
        "steps": [
            "1. Author ci.yml.",
            "2. Add service containers for postgres + redis.",
            "3. Verify matrix + caching.",
            "4. Open dummy PR to validate green path.",
        ],
    },
]

# UC tasks -----------------------------------------------------------------
# Each entry includes everything needed to generate the 8 task files.

UCS = {
    "UC-001": {
        "name": "View meeting catalog",
        "module": "mod-common",
        "actor": "AUTHOR",
        "has_fe": True,
        "wave_be": 1, "wave_fe": 2,
        "be_deps": ["TECH-003", "TECH-005"],
        "fe_deps": ["UC-001-BE", "TECH-013"],
        "user_story": "As an Author, I want to see all my meetings with their current pipeline status, so I know which are ready and which are still processing.",
        "acceptance": [
            "GIVEN at least one Meeting exists, WHEN I open the catalog, THEN I see a list of meetings sorted by updated_at descending.",
            "EACH row shows: title (or filename fallback), status badge (per ENUM-MeetingStatus), language, uploaded_at, duration if available.",
            "GIVEN a meeting in a transient state (UPLOADING / TRANSCRIBING / PROTOCOL_GENERATING), THEN its row shows a progress indicator that auto-refreshes.",
        ],
        "requirements": [
            ("RQ-001", "functional", "high", "Meeting catalog MUST sort meetings by updated_at descending."),
            ("RQ-002", "functional", "high", "Meeting rows in transient statuses (UPLOADING, TRANSCRIBING, PROTOCOL_GENERATING) MUST auto-refresh their status without requiring a full page reload."),
            ("RQ-003", "functional", "medium", "AUTHOR sees only own meetings (BRQ-016). Enforcement deferred until auth is added (NFR-007); MVP semantically equivalent to 'all'."),
            ("NFR-007", "nfr/security", "medium", "MVP runs without authentication; single trust boundary."),
        ],
        "endpoints": [
            ("GET", "/api/meetings", "List meetings", "MeetingListResponse",
             "Returns Meeting list sorted by updated_at DESC; joins Recording.duration_sec; no pagination at MVP."),
        ],
        "system_steps": [
            "Load Meetings sorted by updated_at DESC; left-join Recording for duration_sec.",
            "Render one row per Meeting with title (or filename fallback), status badge, language, uploaded_at, duration.",
            "For rows in transient states, the client subscribes to SSE per-meeting event stream and applies status patches.",
        ],
        "user_steps": [
            "AUTHOR opens the meeting catalog page.",
            "AUTHOR sees the list and can click 'Open' on a row to navigate to UC-002.",
        ],
        "form_fields": [
            ("title", "Title", "text", False, "Meeting.title (or Recording.filename when null)"),
            ("status", "Status", "badge/select", True, "Meeting.status (enum MeetingStatus)"),
            ("language", "Language", "text", False, "Meeting.language or '—' when null"),
            ("uploaded_at", "Uploaded", "datetime", True, "Meeting.uploaded_at"),
            ("duration_sec", "Duration", "number", False, "Recording.duration_sec (mm:ss formatted)"),
            ("open_button", "Open", "button", False, "Navigates to /meetings/:id"),
        ],
    },
    "UC-002": {
        "name": "View meeting detail",
        "module": "mod-common",
        "actor": "AUTHOR",
        "has_fe": True,
        "wave_be": 2, "wave_fe": 3,
        "be_deps": ["UC-001-BE"],
        "fe_deps": ["UC-002-BE", "TECH-013"],
        "user_story": "As an Author, I want to open a meeting and see its status, recording info, and links to transcript/protocol, so I have a single entry point per meeting.",
        "acceptance": [
            "GIVEN a Meeting, WHEN I open its detail page, THEN I see: title, language, status, recording metadata (filename, size, duration), and current job error_reason when FAILED.",
            "GIVEN status >= TRANSCRIPT_READY, THEN a link to view the transcript is visible (UC-201).",
            "GIVEN status >= PROTOCOL_READY, THEN a link to review/edit the protocol is visible (UC-301).",
        ],
        "requirements": [
            ("RQ-002", "functional", "high", "Auto-refresh status without full page reload."),
            ("RQ-003", "functional", "medium", "AUTHOR sees only own meetings (deferred per NFR-007)."),
            ("RQ-004", "functional", "high", "Meeting detail MUST surface the current job's error_reason when Meeting.status=FAILED."),
            ("RQ-005", "functional", "high", "Action links gated by status: 'View transcript' enabled in {TRANSCRIPT_READY, PROTOCOL_GENERATING, PROTOCOL_READY, EDITED}; 'Review/Edit protocol' enabled in {PROTOCOL_READY, EDITED}; 'Export PDF' enabled in {PROTOCOL_READY, EDITED}."),
            ("NFR-007", "nfr/security", "medium", "MVP no-auth single trust boundary."),
        ],
        "endpoints": [
            ("GET", "/api/meetings/:id", "Get meeting detail", "MeetingDetailResponse",
             "Returns Meeting + Recording + most-recent TranscriptionJob + most-recent ProtocolGenerationJob + flags transcriptExists/protocolExists."),
            ("GET", "/api/meetings/:id/events", "SSE event stream", "EventStream",
             "Implemented by TECH-012; consumed for status auto-refresh."),
        ],
        "system_steps": [
            "Load Meeting by id with eager Recording, latest TranscriptionJob, latest ProtocolGenerationJob, and existence flags for Transcript/Protocol.",
            "Compose response surfacing error_reason from the latest job when Meeting.status=FAILED.",
            "Stream status patches via SSE per TECH-012.",
        ],
        "user_steps": [
            "AUTHOR navigates from catalog or via direct URL /meetings/:id.",
            "AUTHOR sees detail panel; available action links depend on status (RQ-005).",
            "AUTHOR clicks: View transcript (-> UC-201), Review/Edit protocol (-> UC-301), Export PDF (-> UC-302 endpoint), or Delete (-> UC-003).",
        ],
        "form_fields": [
            ("title", "Title", "text", False, "Meeting.title"),
            ("language", "Language", "select", False, "Meeting.language"),
            ("status", "Status", "badge", True, "Meeting.status"),
            ("uploaded_at", "Uploaded at", "datetime", True, "Meeting.uploaded_at"),
            ("updated_at", "Last update", "datetime", True, "Meeting.updated_at"),
            ("filename", "File name", "text", True, "Recording.filename"),
            ("size_bytes", "Size", "number", True, "Recording.size_bytes (humanized)"),
            ("mime_type", "Format", "select", True, "Recording.mime_type"),
            ("duration_sec", "Duration", "number", False, "Recording.duration_sec"),
            ("error_reason", "Error", "textarea", False, "Latest job error_reason when status=FAILED"),
            ("delete_button", "Delete meeting", "button", False, "Triggers UC-003 confirm dialog"),
        ],
    },
    "UC-003": {
        "name": "Delete meeting",
        "module": "mod-common",
        "actor": "AUTHOR",
        "has_fe": True,
        "wave_be": 3, "wave_fe": 4,
        "be_deps": ["UC-002-BE"],
        "fe_deps": ["UC-003-BE", "TECH-013"],
        "user_story": "As an Author, I want to delete a meeting and all its derived artifacts, so I can clean up obsolete or sensitive recordings.",
        "acceptance": [
            "GIVEN any Meeting, WHEN I confirm deletion, THEN the Meeting, its Recording (storage object removed), Transcript, Protocol, and all jobs are deleted.",
            "GIVEN deletion succeeds, THEN I am returned to the catalog (UC-001) with a confirmation toast.",
            "WHILE a job is IN_PROGRESS, deletion shows confirmation that the in-flight job will be marked FAILED.",
        ],
        "requirements": [
            ("RQ-003", "functional", "medium", "Ownership scope (deferred per NFR-007)."),
            ("RQ-006", "functional", "high", "Meeting deletion MUST cascade-remove Protocol, ProtocolGenerationJob, Transcript, TranscriptionJob, Recording (incl. storage object in EXT-04), and the Meeting itself."),
            ("RQ-007", "functional", "high", "Deletion while a job is IN_PROGRESS MUST require confirmation and MUST mark the in-flight job FAILED with error_reason='deleted by user'. Already-terminal jobs preserve BRQ-009 immutability."),
            ("NFR-007", "nfr/security", "medium", "MVP no-auth."),
        ],
        "endpoints": [
            ("DELETE", "/api/meetings/:id", "Delete meeting", "MeetingDeleteResponse",
             "Cascade-delete derived rows + storage object; returns {deleted:true, in_flight_failed:boolean}."),
        ],
        "system_steps": [
            "Begin transaction.",
            "Mark any IN_PROGRESS TranscriptionJob/ProtocolGenerationJob -> FAILED with error_reason='deleted by user' (RQ-007).",
            "Delete Protocol, ProtocolGenerationJob, Transcript, TranscriptionJob, Recording rows in dependency order (relies on Prisma cascade from TECH-003).",
            "Remove the storage object in EXT-04 via IStorage.deleteObject(Recording.storage_path).",
            "Delete Meeting; commit.",
            "Emit SSE 'meeting.deleted' so any open clients close the detail view.",
        ],
        "user_steps": [
            "AUTHOR clicks Delete on the meeting detail page (from UC-002).",
            "System shows confirmation dialog showing the title; if a job is IN_PROGRESS, the dialog warns it will be marked FAILED.",
            "AUTHOR confirms (or cancels and returns to UC-002).",
            "On success, AUTHOR is redirected to catalog (UC-001) with a success toast.",
        ],
        "form_fields": [
            ("header", "Delete this meeting?", "header", False, "Static heading"),
            ("title", "Meeting title", "text", False, "Echoes Meeting.title or filename"),
            ("warning", "In-flight job warning", "alert", False, "Shown when any job is IN_PROGRESS"),
            ("confirm_button", "Confirm delete", "button", False, "Calls DELETE /api/meetings/:id"),
            ("cancel_button", "Cancel", "button", False, "Closes dialog; no state change"),
        ],
    },
    "UC-100": {
        "name": "Upload meeting video",
        "module": "mod-ingest",
        "actor": "AUTHOR",
        "has_fe": True,
        "wave_be": 1, "wave_fe": 2,
        "be_deps": ["TECH-003", "TECH-005", "TECH-007", "TECH-008"],
        "fe_deps": ["UC-100-BE", "TECH-013"],
        "user_story": "As an Author, I want to upload a 300-500 MB meeting video with an optional language hint, so the system starts transcription.",
        "acceptance": [
            "GIVEN a valid MP4/MKV/MOV file <= 500 MB (BRQ-001, BRQ-002), WHEN I upload, THEN the system accepts, creates Meeting + Recording + TranscriptionJob, and shows status UPLOADING -> TRANSCRIBING.",
            "GIVEN a file > 500 MB or wrong MIME, WHEN I attempt upload, THEN the system rejects before storage with a clear error.",
            "GIVEN a corrupt file (BRQ-003), WHEN validation fails, THEN the system rejects with a user-facing error.",
            "I can choose RU or EN as the language hint; leaving it blank means auto-detect (BRQ-005).",
        ],
        "requirements": [
            ("RQ-008", "functional/validation", "high", "Reject size_bytes > 524,288,000 (500 MB) BEFORE any storage upload begins."),
            ("RQ-009", "functional/validation", "high", "Accept exactly {video/mp4, video/x-matroska, video/quicktime}; reject others with clear user-facing error."),
            ("RQ-010", "functional/validation", "high", "Verify container integrity at upload acceptance (probe header / short sample). Corrupt files rejected before Recording is persisted (BRQ-003)."),
            ("RQ-011", "functional", "high", "On successful upload completion, atomically: (1) finalize Recording metadata; (2) transition Meeting.status UPLOADING -> TRANSCRIBING (BRQ-008); (3) create exactly one TranscriptionJob with status=QUEUED per Recording (BRQ-006)."),
            ("RQ-012", "functional", "high", "Language selector accepts RU, EN, or blank. Blank -> Meeting.language stays null; ASR auto-detects per BRQ-005."),
            ("RQ-013", "functional", "medium", "Meeting.title defaults to Recording.filename (without extension) when AUTHOR leaves the field blank."),
            ("NFR-001", "nfr/performance", "high", "Upload pipeline accepts up to 500 MB via chunked transfer without timeout."),
            ("NFR-002", "nfr/performance", "high", "Transcription/protocol run asynchronously; UI surfaces job progress without blocking."),
            ("NFR-004", "nfr/integration", "high", "Support RU and EN throughout (UI, ASR hint, prompts, errors)."),
            ("NFR-005", "nfr/infra", "high", "Recordings persist in durable object storage until both Transcript and Protocol are produced."),
        ],
        "endpoints": [
            ("POST", "/api/uploads", "Create TUS upload session", "TusCreateResponse",
             "TUS pre-create. Reads Upload-Metadata for filename/mime/size/title/language. Validates RQ-008+RQ-009 BEFORE accepting bytes."),
            ("PATCH", "/api/uploads/:uploadId", "Stream upload chunks", "TusPatchResponse",
             "TUS chunk PATCH. Streams to S3 via TECH-008."),
            ("POST", "/api/uploads/:uploadId/finalize", "Finalize upload", "UploadFinalizeResponse",
             "On TUS on-finish hook: probeContainer (RQ-010), atomically create Meeting+Recording, transition UPLOADING->TRANSCRIBING, enqueue TranscriptionJob (RQ-011). Returns {meeting_id}."),
        ],
        "system_steps": [
            "On TUS pre-create: validate size <= 500 MB (RQ-008); validate mime in {video/mp4, video/x-matroska, video/quicktime} (RQ-009). Reject pre-bytes with 4xx + error code.",
            "Accept chunked PATCH bytes; stream directly to S3 (TECH-007/008).",
            "On TUS upload-finish: probeContainer via ffprobe (RQ-010). On failure -> delete partial object + return 422.",
            "In a single DB transaction: insert Meeting(status=UPLOADING, language=hint|null, title=hint|filename-no-ext per RQ-013), insert Recording(filename, size_bytes, mime_type, storage_path), enqueue TranscriptionJob(status=QUEUED, recording_id, meeting_id), transition Meeting.status -> TRANSCRIBING (RQ-011).",
            "Return {meeting_id} so client can redirect to UC-002.",
        ],
        "user_steps": [
            "AUTHOR navigates to /upload.",
            "AUTHOR selects a video file via picker (max 500 MB; MP4/MKV/MOV).",
            "AUTHOR optionally sets language (RU/EN; blank = auto-detect) and title (defaults to filename).",
            "AUTHOR clicks Upload; sees progress bar driven by TUS upload progress events.",
            "On error, inline message appears on the form (RQ-008/009/010 failures).",
            "On success, AUTHOR is redirected to /meetings/:id with success toast.",
        ],
        "form_fields": [
            ("header", "Upload meeting video", "header", False, "Static heading"),
            ("file", "Video file (MP4 / MKV / MOV, max 500 MB)", "file", True, "Recording.filename + size + mime"),
            ("language", "Language (leave blank for auto-detect)", "select", False, "Meeting.language; options RU/EN/blank"),
            ("title", "Meeting title (defaults to filename)", "text", False, "Meeting.title"),
            ("submit_button", "Upload", "button", False, "Starts TUS session"),
            ("cancel_button", "Cancel", "button", False, "Abandon flow"),
        ],
    },
    "UC-200": {
        "name": "Process transcription pipeline",
        "module": "mod-transcription",
        "actor": "SYSTEM",
        "has_fe": False,
        "wave_be": 2, "wave_fe": None,
        "be_deps": ["UC-100-BE", "TECH-006", "TECH-009", "TECH-010", "TECH-012"],
        "fe_deps": [],
        "user_story": "As the SYSTEM, I dequeue a queued TranscriptionJob, run ASR + diarization on the recording, resolve speaker names, and persist a verbatim Transcript with status updates.",
        "acceptance": [
            "GIVEN a QUEUED TranscriptionJob, WHEN a worker picks it up, THEN job.status -> IN_PROGRESS and started_at is set.",
            "GIVEN ASR succeeds, THEN Transcript is persisted, speakers resolved per BRQ-021, Meeting.status -> TRANSCRIPT_READY, job.status -> COMPLETED, and a ProtocolGenerationJob is auto-created (BRQ-007).",
            "GIVEN ASR fails, THEN job.status -> FAILED with non-null error_reason (BRQ-010), and Meeting.status -> FAILED; terminal states are immutable (BRQ-009).",
        ],
        "requirements": [
            ("RQ-014", "functional", "high", "TranscriptionJob lifecycle: QUEUED -> IN_PROGRESS -> {COMPLETED, FAILED}. Terminal states immutable (BRQ-009)."),
            ("RQ-015", "functional", "high", "On ANY failure (storage fetch, audio extraction, ASR call, response parsing) -> job.status=FAILED with non-null error_reason; Meeting.status -> FAILED (BRQ-008/010)."),
            ("RQ-016", "functional", "high", "On successful completion of TranscriptionJob, auto-create exactly one ProtocolGenerationJob (status=QUEUED, transcript_id, prompt_template_version=current) per BRQ-007."),
            ("RQ-017", "functional", "high", "Speaker name resolution MUST attempt to map anonymous diarization labels to real names via self-introductions / addressed names in the transcript. Confident matches substitute across full_text and populate speaker_map. Unresolved labels remain 'Speaker N' (BRQ-021)."),
            ("RQ-018", "functional", "high", "Language: if Meeting.language is null, ASR detects and writes Transcript.language; Meeting.language stays null. If set, it is passed as hint and Transcript.language SHOULD match (BRQ-005)."),
            ("NFR-002", "nfr/performance", "high", "Async job-based execution; no UI blocking."),
            ("NFR-003", "nfr/performance", "medium", "No processing-time SLA at MVP."),
            ("NFR-004", "nfr/integration", "high", "RU + EN throughout."),
            ("NFR-008", "nfr/infra", "high", "Failures surfaced with human-readable error_reason; terminal jobs immutable."),
        ],
        "endpoints": [
            ("WORKER", "queue:transcriptionJob", "Process TranscriptionJob", "n/a",
             "BullMQ worker handler. No HTTP surface. Payload: {transcription_job_id}."),
        ],
        "system_steps": [
            "Worker dequeues; UPDATE TranscriptionJob SET status='IN_PROGRESS', started_at=now WHERE id=:id AND status='QUEUED' (optimistic concurrency).",
            "Fetch Recording bytes from S3 via IStorage.getObjectStream(recording.storage_path).",
            "extractAudio + probeContainer (TECH-009); populate Recording.duration_sec.",
            "Submit audio + Meeting.language hint to IAsrProvider.transcribe (TECH-010).",
            "On ASR success: receive segments + speaker labels + detectedLanguage.",
            "Resolve speakers per RQ-017: parse full_text for self-introductions / addressed names; build speaker_map; substitute resolved labels in full_text; unresolved remain 'Speaker N' mapping to null.",
            "Insert Transcript(meeting_id, full_text, segments_count, speakers_count, language=detected|hint, speaker_map, created_at=now).",
            "Transition Meeting.status -> TRANSCRIPT_READY (BRQ-008).",
            "Transition TranscriptionJob.status -> COMPLETED, completed_at=now.",
            "Auto-create ProtocolGenerationJob(status=QUEUED, transcript_id, meeting_id, prompt_template_version=current) and enqueue (RQ-016).",
            "Publish SSE 'meeting.status' event for TRANSCRIPT_READY.",
            "ALT failure path: any thrown error -> mark job FAILED with error_reason=err.message; set Meeting.status=FAILED; publish SSE; do NOT re-enqueue (RQ-014, RQ-015).",
        ],
        "user_steps": [],
        "form_fields": [],
    },
    "UC-201": {
        "name": "View and download transcript",
        "module": "mod-transcription",
        "actor": "AUTHOR",
        "has_fe": True,
        "wave_be": 3, "wave_fe": 4,
        "be_deps": ["UC-200-BE"],
        "fe_deps": ["UC-201-BE", "TECH-013"],
        "user_story": "As an Author, I want to view the verbatim transcript with speaker labels and download it as a text file, so I have a permanent meeting record.",
        "acceptance": [
            "GIVEN Meeting.status >= TRANSCRIPT_READY, WHEN I open the transcript view, THEN I see segments with speaker labels, timestamps, and counts (segments_count, speakers_count).",
            "I can download the transcript as a text file with a one-click action.",
            "Unresolved speakers (BRQ-021) are shown as 'Speaker N'; resolved speakers show the real name.",
        ],
        "requirements": [
            ("RQ-019", "functional", "high", "Transcript view MUST display each segment with its speaker label (resolved from speaker_map or 'Speaker N') and minute/second timestamps."),
            ("RQ-020", "functional", "medium", "Download produces a plain-text file (.txt) with verbatim transcript + speaker labels + timestamps. Filename: '<meeting-title>-transcript.txt' (or filename fallback when title is null)."),
        ],
        "endpoints": [
            ("GET", "/api/meetings/:id/transcript", "Get transcript JSON", "TranscriptResponse",
             "Returns Transcript + speaker_map for rendering."),
            ("GET", "/api/meetings/:id/transcript/download", "Download transcript text", "text/plain",
             "Streams plain-text file with Content-Disposition: attachment; filename per RQ-020."),
        ],
        "system_steps": [
            "Load Transcript by meeting_id; gate on Meeting.status >= TRANSCRIPT_READY (return 409 otherwise).",
            "For JSON endpoint: return Transcript shape with full_text + speaker_map.",
            "For download endpoint: stream full_text as text/plain with Content-Disposition attachment filename '<title or filename>-transcript.txt' (RQ-020).",
        ],
        "user_steps": [
            "AUTHOR clicks 'View transcript' from the meeting detail page.",
            "AUTHOR sees the transcript with speaker labels and timestamps; header shows segments_count, speakers_count, language, created_at.",
            "AUTHOR clicks Download to save a plain-text file.",
            "AUTHOR clicks 'Back to meeting' to return to UC-002.",
        ],
        "form_fields": [
            ("header", "Transcript", "header", False, "Static heading"),
            ("language", "Language", "select", True, "Transcript.language"),
            ("segments_count", "Segments", "number", True, "Transcript.segments_count"),
            ("speakers_count", "Speakers", "number", True, "Transcript.speakers_count"),
            ("created_at", "Created", "datetime", True, "Transcript.created_at"),
            ("full_text", "Transcript content", "textarea (read-only)", True, "Transcript.full_text rendered with speaker labels + timestamps"),
            ("speaker_map", "Speaker name map", "textarea", False, "Transcript.speaker_map (debug visibility)"),
            ("download_button", "Download as text", "button", False, "Calls /transcript/download"),
            ("back_button", "Back to meeting", "button", False, "Navigates to UC-002"),
        ],
    },
    "UC-300": {
        "name": "Generate protocol pipeline",
        "module": "mod-protocol",
        "actor": "SYSTEM",
        "has_fe": False,
        "wave_be": 3, "wave_fe": None,
        "be_deps": ["UC-200-BE", "TECH-011"],
        "fe_deps": [],
        "user_story": "As the SYSTEM, when a transcript becomes ready I auto-trigger LLM-based protocol generation and persist the Markdown result with status updates.",
        "acceptance": [
            "GIVEN a Transcript is COMPLETED, THEN a ProtocolGenerationJob is auto-created per BRQ-007 with status=QUEUED.",
            "GIVEN a worker runs the job, THEN it loads the transcript, selects the prompt template by language (BRQ-013), calls the LLM, parses the response, and validates required sections (BRQ-011).",
            "GIVEN LLM succeeds AND all required sections are present, THEN Protocol is persisted (markdown, version=1, edit_count=0), Meeting.status -> PROTOCOL_READY, job.status -> COMPLETED.",
            "GIVEN LLM fails OR response is invalid, THEN job.status -> FAILED with error_reason, Meeting.status -> FAILED.",
        ],
        "requirements": [
            ("RQ-021", "functional", "high", "ProtocolGenerationJob lifecycle: QUEUED -> IN_PROGRESS -> {COMPLETED, FAILED}. Terminal immutable (BRQ-009)."),
            ("RQ-022", "functional", "high", "LLM prompt template selected by Transcript.language (BRQ-013); resulting protocol language MUST match transcript language. Template version recorded on job."),
            ("RQ-023", "functional/validation", "high", "Persisted Protocol MUST contain Participants, Discussion Topics, Decisions, Action Items (BRQ-011). Missing section -> job FAILED."),
            ("RQ-024", "functional", "medium", "Action items SHOULD include assignee/deadline when stated (BRQ-012). Best-effort by LLM."),
            ("RQ-025", "functional", "high", "Initial Protocol on success: version=1, edit_count=0, generated_at=now. Meeting.status -> PROTOCOL_READY (BRQ-008/014/015)."),
            ("RQ-026", "functional", "high", "On ANY failure (LLM error, parse error, missing required sections) -> job FAILED with error_reason; Meeting FAILED (BRQ-008/010)."),
            ("NFR-002", "nfr/performance", "high", "Async; non-blocking UI."),
            ("NFR-003", "nfr/performance", "medium", "No SLA at MVP."),
            ("NFR-004", "nfr/integration", "high", "RU + EN."),
            ("NFR-006", "nfr/integration", "high", "Markdown canonical; PDF transient (re-rendered)."),
            ("NFR-008", "nfr/infra", "high", "Failures surfaced; terminal immutable."),
        ],
        "endpoints": [
            ("WORKER", "queue:protocolGenerationJob", "Process ProtocolGenerationJob", "n/a",
             "BullMQ worker handler. Payload: {protocol_generation_job_id}."),
        ],
        "system_steps": [
            "Worker dequeues; UPDATE ProtocolGenerationJob SET status='IN_PROGRESS', started_at=now WHERE id=:id AND status='QUEUED'.",
            "Load Transcript via transcript_id; read language.",
            "Select prompt template per Transcript.language (RU/EN); record prompt_template_version on job (RQ-022).",
            "Submit transcript + selected prompt to ILlmProvider.generate (TECH-011).",
            "Parse LLM response into Markdown.",
            "Validate four required sections are present: Participants, Discussion Topics, Decisions, Action Items (RQ-023). Missing -> FAILED path.",
            "Insert Protocol(meeting_id, markdown_content, version=1, edit_count=0, generated_at=now) (RQ-025).",
            "Transition Meeting.status -> PROTOCOL_READY (BRQ-008).",
            "Transition ProtocolGenerationJob.status -> COMPLETED, completed_at=now (RQ-021).",
            "Publish SSE 'meeting.status' event.",
            "ALT failure path: catch any thrown error or section-missing -> mark job FAILED with descriptive error_reason; Meeting.status -> FAILED; publish SSE; do NOT re-enqueue (RQ-026).",
        ],
        "user_steps": [],
        "form_fields": [],
    },
    "UC-301": {
        "name": "Review and edit protocol",
        "module": "mod-protocol",
        "actor": "AUTHOR",
        "has_fe": True,
        "wave_be": 4, "wave_fe": 5,
        "be_deps": ["UC-300-BE"],
        "fe_deps": ["UC-301-BE", "TECH-013"],
        "user_story": "As an Author, I want to review the generated protocol and edit it in a Markdown editor, so I can correct LLM mistakes before sharing.",
        "acceptance": [
            "GIVEN Meeting.status in {PROTOCOL_READY, EDITED}, WHEN I open the protocol, THEN it loads in a Markdown editor with rendered preview.",
            "WHEN I save changes, THEN Protocol.markdown_content is updated, version increments by 1 (BRQ-014), edit_count increments by 1 (BRQ-015), last_edited_at is set, and Meeting.status -> EDITED.",
            "All edits operate on the canonical Markdown (BRQ-018); preview is a derivation.",
        ],
        "requirements": [
            ("RQ-027", "functional", "high", "Each save increments version by exactly 1 (BRQ-014); monotonic."),
            ("RQ-028", "functional", "high", "Each save increments edit_count by exactly 1 (BRQ-015); equals manual-save count since generation."),
            ("RQ-029", "functional", "high", "First save: Meeting.status PROTOCOL_READY -> EDITED (BRQ-008). Subsequent saves keep status=EDITED. last_edited_at updated every save."),
            ("RQ-030", "functional", "high", "Edits operate on canonical Markdown (BRQ-018); preview is a derivation, never persisted."),
            ("RQ-031", "functional", "medium", "Editor warns AUTHOR before navigating away with unsaved changes."),
        ],
        "endpoints": [
            ("GET", "/api/meetings/:id/protocol", "Get protocol Markdown", "ProtocolResponse",
             "Returns {markdown_content, version, edit_count, generated_at, last_edited_at}."),
            ("PUT", "/api/meetings/:id/protocol", "Save protocol edits", "ProtocolSaveResponse",
             "Body: {markdown_content}. Atomically: markdown_content=new, version+=1, edit_count+=1, last_edited_at=now; Meeting.status -> EDITED (if not already). Returns updated {version, edit_count, last_edited_at}."),
        ],
        "system_steps": [
            "GET: load Protocol by meeting_id; gate on Meeting.status in {PROTOCOL_READY, EDITED} (RQ-029).",
            "PUT (save): in a transaction -> UPDATE Protocol SET markdown_content=:m, version=version+1, edit_count=edit_count+1, last_edited_at=now WHERE meeting_id=:id (RQ-027/028).",
            "Transition Meeting.status to EDITED if not already (RQ-029).",
            "Return updated metadata in response.",
            "Reject save if Meeting.status NOT in {PROTOCOL_READY, EDITED} (409).",
        ],
        "user_steps": [
            "AUTHOR clicks 'Review/Edit protocol' from the meeting detail page (UC-002).",
            "Editor renders Markdown via Milkdown WYSIWYG with side-by-side rendered preview. Header shows version + edit_count + last_edited_at.",
            "AUTHOR edits content; preview updates live.",
            "AUTHOR clicks Save; success indicator shows new version.",
            "If AUTHOR navigates away with unsaved changes, browser-native or in-app confirmation warns (RQ-031).",
            "AUTHOR can also click 'Export PDF' (calls UC-302 endpoint) or 'Back to meeting'.",
        ],
        "form_fields": [
            ("header", "Protocol editor", "header", False, "Static heading"),
            ("markdown_content", "Protocol (Markdown)", "textarea (Milkdown WYSIWYG)", True, "Protocol.markdown_content - the editable canonical Markdown"),
            ("version", "Version", "number", True, "Protocol.version (read-only)"),
            ("edit_count", "Edits", "number", True, "Protocol.edit_count (read-only)"),
            ("last_edited_at", "Last edited", "datetime", False, "Protocol.last_edited_at"),
            ("generated_at", "Generated", "datetime", True, "Protocol.generated_at"),
            ("save_button", "Save", "button", False, "Calls PUT /api/meetings/:id/protocol"),
            ("export_pdf_button", "Export PDF", "button", False, "Triggers UC-302 download"),
            ("back_button", "Back to meeting", "button", False, "Navigates to UC-002"),
        ],
    },
    "UC-302": {
        "name": "Export protocol to PDF",
        "module": "mod-protocol",
        "actor": "AUTHOR",
        "has_fe": False,  # No dedicated screen; buttons live in UC-002/UC-301 forms
        "wave_be": 5, "wave_fe": None,
        "be_deps": ["UC-301-BE", "TECH-014"],
        "fe_deps": [],
        "user_story": "As an Author, I want to export the protocol as a PDF, so I can distribute it as a polished document. Triggered as an action from UC-002 detail and UC-301 editor; no dedicated screen.",
        "acceptance": [
            "GIVEN Meeting.status in {PROTOCOL_READY, EDITED}, WHEN I click 'Export PDF', THEN the system renders the current Markdown to PDF and delivers it as a download.",
            "The rendered PDF is NOT persisted (BRQ-017); each export re-renders from canonical Markdown.",
            "The exported document includes all four required sections (BRQ-011): Participants, Discussion Topics, Decisions, Action Items.",
        ],
        "requirements": [
            ("RQ-032", "functional", "high", "PDF export is transient: rendered PDF MUST NOT be persisted (BRQ-017); each export re-renders from canonical Markdown (BRQ-018)."),
            ("RQ-033", "functional", "high", "Exported PDF MUST include the four required sections (BRQ-011). On render failure, no file delivered and no state change persisted."),
        ],
        "endpoints": [
            ("GET", "/api/meetings/:id/protocol/pdf", "Export protocol PDF", "application/pdf",
             "Streams Puppeteer-rendered PDF. Gate on Meeting.status in {PROTOCOL_READY, EDITED}. NEVER persists output (RQ-032)."),
        ],
        "system_steps": [
            "Gate on Meeting.status in {PROTOCOL_READY, EDITED} (RQ-032 - return 409 otherwise).",
            "Load Protocol.markdown_content (canonical per BRQ-018).",
            "Invoke renderPdf(markdown, {title, version}) from TECH-014.",
            "Stream Buffer as application/pdf with Content-Disposition attachment filename '<title>-protocol-v<version>.pdf'.",
            "Do NOT persist the rendered buffer (RQ-032).",
            "ALT: on render failure -> return 500 with stable error code 'PDF_RENDER_FAILED'; no state change (RQ-033).",
        ],
        "user_steps": [],
        "form_fields": [],
    },
}


# =========================================================================
# RENDERERS
# =========================================================================

def header(uc_id: str, uc: dict, kind: str) -> str:
    deps = uc["be_deps"] if kind in ("be", "test", "impl", "api", "acceptance") else uc["fe_deps"]
    blocks = []
    if kind in ("be", "test", "impl"):
        if uc["has_fe"]:
            blocks.append(f"{uc_id}-FE")
        # downstream UCs that depend on this UC
    return dedent(f"""\
        ---
        id: {uc_id}-{kind.upper()}
        title: {uc['name']}
        type: {kind}
        uc: {uc_id}
        module: {uc['module']}
        actor: {uc['actor']}
        wave: {uc.get('wave_' + kind, uc.get('wave_be'))}
        priority: high
        depends_on: {deps}
        blocks: {blocks}
        ---

    """)


def fmt_requirements(uc: dict) -> str:
    lines = ["| ID | Type | Priority | Description |", "|----|------|----------|-------------|"]
    for rid, rtype, prio, desc in uc["requirements"]:
        lines.append(f"| {rid} | {rtype} | {prio} | {desc.replace('|', '\\|')} |")
    return "\n".join(lines)


def fmt_endpoints(uc: dict) -> str:
    lines = ["| Method | Path | Description |", "|--------|------|-------------|"]
    for m, p, d, _resp, _note in uc["endpoints"]:
        lines.append(f"| {m} | `{p}` | {d} |")
    return "\n".join(lines)


def fmt_entity_table(entity_name: str) -> str:
    e = ENTITIES[entity_name]
    out = [f"### Entity: {entity_name}",
           f"_{e['desc']}_  ",
           "",
           "| Attribute | Type | Nullable | Internal | Description |",
           "|-----------|------|----------|----------|-------------|"]
    for name, typ, nullable, internal, desc in e["attrs"]:
        out.append(f"| `{name}` | {typ} | {'yes' if nullable else 'no'} | {'yes' if internal else 'no'} | {desc.replace('|', '\\|')} |")
    return "\n".join(out)


def fmt_enums(enum_names: list[str]) -> str:
    out = []
    for en in enum_names:
        if en not in ENUMS:
            continue
        out.append(f"#### `{en}`")
        for v, d in ENUMS[en]:
            out.append(f"- `{v}` — {d}")
        out.append("")
    return "\n".join(out)


def relevant_entities(uc_id: str) -> list[str]:
    mapping = {
        "UC-001": ["Meeting", "Recording"],
        "UC-002": ["Meeting", "Recording", "TranscriptionJob", "ProtocolGenerationJob"],
        "UC-003": ["Meeting", "Recording", "TranscriptionJob", "Transcript", "ProtocolGenerationJob", "Protocol"],
        "UC-100": ["Meeting", "Recording", "TranscriptionJob"],
        "UC-200": ["Meeting", "Recording", "TranscriptionJob", "Transcript", "ProtocolGenerationJob"],
        "UC-201": ["Meeting", "Transcript"],
        "UC-300": ["Meeting", "Transcript", "ProtocolGenerationJob", "Protocol"],
        "UC-301": ["Meeting", "Protocol"],
        "UC-302": ["Meeting", "Protocol"],
    }
    return mapping.get(uc_id, [])


def relevant_enums(uc_id: str) -> list[str]:
    mapping = {
        "UC-001": ["MeetingStatus", "MeetingLanguage"],
        "UC-002": ["MeetingStatus", "MeetingLanguage", "JobStatus", "VideoMimeType"],
        "UC-003": ["MeetingStatus", "JobStatus"],
        "UC-100": ["MeetingStatus", "MeetingLanguage", "VideoMimeType"],
        "UC-200": ["MeetingStatus", "MeetingLanguage", "JobStatus"],
        "UC-201": ["MeetingLanguage"],
        "UC-300": ["MeetingStatus", "MeetingLanguage", "JobStatus"],
        "UC-301": ["MeetingStatus"],
        "UC-302": ["MeetingStatus"],
    }
    return mapping.get(uc_id, [])


# ---- task-be.md ----------------------------------------------------------
def render_task_be(uc_id: str, uc: dict) -> str:
    role = ROLES.get(uc["actor"], ROLES["AUTHOR"])
    entities_md = "\n\n".join(fmt_entity_table(e) for e in relevant_entities(uc_id))
    enums_md = fmt_enums(relevant_enums(uc_id))
    sys_steps = "\n".join(f"{i+1}. {s}" for i, s in enumerate(uc["system_steps"]))
    endpoints_md = fmt_endpoints(uc) if uc["endpoints"] else "_No HTTP endpoints — worker UC (see queue payload in api-contract.md)._"
    reqs_md = fmt_requirements(uc)
    is_worker = uc["actor"] == "SYSTEM"
    blocks_val = [uc_id + '-FE'] if uc['has_fe'] else []
    perms_rows = "\n".join(f"| `{e}` | {c} | {s} |" for e, c, s in role["perms"])
    dod_last = (f"- [ ] BE/FE sync passes (`/nacl-tl-sync {uc_id}`)." if uc['has_fe']
                else "- [ ] Worker job lifecycle verified end-to-end with a sample fixture.")
    return f"""---
id: {uc_id}-BE
title: {uc['name']} — backend
type: uc-be
uc: {uc_id}
module: {uc['module']}
actor: {uc['actor']}
wave: {uc['wave_be']}
priority: high
depends_on: {uc['be_deps']}
blocks: {blocks_val}
---

# {uc_id}-BE — {uc['name']} ({'worker' if is_worker else 'API'})

## User story

> {uc['user_story']}

## Actor

**{uc['actor']}** — {role['desc']}

Permissions (AUTHOR is the only human role; SYSTEM owns job lifecycles):

| Entity | CRUD | Scope |
|--------|------|-------|
{perms_rows}

## Functional requirements

{reqs_md}

## API endpoints / worker contract

{endpoints_md}

See `api-contract.md` for full request/response schemas and error codes.

## System steps (main flow)

{sys_steps}

## Domain context (embedded — do NOT requery Neo4j)

{entities_md}

## Enumerations

{enums_md}

## Definition of done

- [ ] All endpoints / worker handlers implemented per `api-contract.md`.
- [ ] All listed requirements verified by tests in `test-spec.md`.
- [ ] Prisma migrations include any new indexes/constraints required.
- [ ] All thrown errors map to `AppError` with stable `code` per TECH-005 error handler.
- [ ] No external SA-doc lookups in source — all logic justified by RQ IDs in code comments.
{dod_last}
"""


# ---- task-fe.md ----------------------------------------------------------
def render_task_fe(uc_id: str, uc: dict) -> str:
    if not uc["has_fe"]:
        host = "UC-002 (meeting detail) and/or UC-301 (protocol editor)" if uc_id == "UC-302" else "the corresponding UC's forms"
        return dedent(f"""\
            ---
            id: {uc_id}-FE
            title: {uc['name']} — frontend (N/A)
            type: uc-fe
            uc: {uc_id}
            wave: null
            ---

            # {uc_id}-FE — N/A

            This UC has **no dedicated frontend task**. {'It is a SYSTEM-actor worker pipeline (no UI).' if uc['actor'] == 'SYSTEM' else f"Its UI hooks (action button) live in {host} form FE tasks."}

            **No work for the FE agent.** Skip to next task. The matching BE task is `{uc_id}-BE`.
        """)

    fields_md = "\n".join(f"| `{n}` | {lbl} | {t} | {'yes' if req else 'no'} | {note.replace('|', '\\|')} |"
                         for n, lbl, t, req, note in uc["form_fields"])
    user_steps = "\n".join(f"{i+1}. {s}" for i, s in enumerate(uc["user_steps"]))
    reqs_md = fmt_requirements(uc)
    enums_md = fmt_enums(relevant_enums(uc_id))
    accept_md = "\n".join(f"- {ac}" for ac in uc["acceptance"])
    return f"""---
id: {uc_id}-FE
title: {uc['name']} — frontend
type: uc-fe
uc: {uc_id}
module: {uc['module']}
actor: {uc['actor']}
wave: {uc['wave_fe']}
priority: high
depends_on: {uc['fe_deps']}
blocks: []
---

# {uc_id}-FE — {uc['name']}

## User story

> {uc['user_story']}

## Acceptance criteria

{accept_md}

## User steps

{user_steps}

## Form fields

| Name | Label | Type | Required | Notes |
|------|-------|------|----------|-------|
{fields_md}

## Requirements

{reqs_md}

## Enumerations (UI display + filtering)

{enums_md}

## API consumption

Consume endpoints defined in `api-contract.md` (BE side at `{uc_id}-BE`).
Use the typed `apiClient` from `web/src/lib/api.ts` (TECH-013) and Zod types
from `@transcrib/shared`. Do NOT inline `fetch` calls.

## Definition of done

- [ ] Form rendered with all listed fields; labels localized via i18next (RU + EN).
- [ ] Inline validation matches BE validation (RQ-008/009 for upload, etc.).
- [ ] All `acceptance` criteria pass in E2E via `/nacl-tl-qa {uc_id}`.
- [ ] BE/FE sync passes (`/nacl-tl-sync {uc_id}`): types from `@transcrib/shared` only; no mocks.
- [ ] Status-driven gating (RQ-005 etc.) wired via TanStack Query + SSE updates.
- [ ] No raw `fetch` in components — only via `apiClient`.
"""


# ---- api-contract.md ----------------------------------------------------
def render_api_contract(uc_id: str, uc: dict) -> str:
    eps = uc["endpoints"]
    is_worker = (len(eps) == 1 and eps[0][0] == "WORKER")
    body = []
    body.append(f"# {uc_id} — API Contract\n")
    body.append(f"**UC:** {uc['name']}  ")
    body.append(f"**BE:** `{uc_id}-BE` · **FE:** `{uc_id}-FE`\n")
    body.append("> SOURCE OF TRUTH for BE/FE interface. Both agents consume this file.\n")

    body.append("## Endpoints\n")
    body.append("| Method | Path | Auth | Description |")
    body.append("|--------|------|------|-------------|")
    for m, p, d, _r, _n in eps:
        auth = "none (NFR-007)" if not is_worker else "n/a"
        body.append(f"| {m} | `{p}` | {auth} | {d} |")
    body.append("")

    # Shared types
    body.append("## Shared types (Zod schemas in `@transcrib/shared`)\n")
    body.append("```ts")
    body.append("// All types live in shared/src/api/" + uc_id.lower().replace('-', '') + ".ts")
    body.append("// BE imports as runtime Zod; FE imports inferred TS types.")
    body.append("import { z } from 'zod';")
    body.append("import { MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType } from '../enums';")
    body.append("")
    # Custom per UC
    body.append(uc_specific_schemas(uc_id, uc))
    body.append("```\n")

    body.append("## Endpoint details\n")
    for m, p, d, resp_type, note in eps:
        body.append(f"### `{m} {p}`")
        body.append(f"{d}\n")
        body.append(f"**Note:** {note}\n")
        body.append(f"**Response type:** `{resp_type}`\n")

    body.append("## Errors\n")
    body.append("All errors are `AppError` (see TECH-005). Stable codes returned in body `{code, message, details?}`.\n")
    body.append("| HTTP | Code | When |")
    body.append("|------|------|------|")
    body.append(uc_error_table(uc_id))
    body.append("")

    body.append("## Authentication\n")
    body.append("MVP runs without auth per **NFR-007**. All endpoints are open. Ownership scope (RQ-003) is semantically 'all' at MVP — to be re-enabled when auth is added.\n")

    return "\n".join(body) + "\n"


def uc_specific_schemas(uc_id: str, uc: dict) -> str:
    schemas = {
        "UC-001": dedent("""\
            export const MeetingListItem = z.object({
              id: z.string().uuid(),
              title: z.string().nullable(),
              filename: z.string(), // fallback when title is null
              status: MeetingStatus,
              language: MeetingLanguage.nullable(),
              uploaded_at: z.string().datetime(),
              updated_at: z.string().datetime(),
              duration_sec: z.number().int().nullable(),
            });
            export type MeetingListItem = z.infer<typeof MeetingListItem>;

            export const MeetingListResponse = z.object({
              items: z.array(MeetingListItem),
            });
            export type MeetingListResponse = z.infer<typeof MeetingListResponse>;"""),
        "UC-002": dedent("""\
            export const MeetingDetailResponse = z.object({
              meeting: z.object({
                id: z.string().uuid(),
                title: z.string().nullable(),
                language: MeetingLanguage.nullable(),
                status: MeetingStatus,
                uploaded_at: z.string().datetime(),
                updated_at: z.string().datetime(),
              }),
              recording: z.object({
                filename: z.string(),
                size_bytes: z.number().int(),
                mime_type: VideoMimeType,
                duration_sec: z.number().int().nullable(),
              }),
              latest_transcription_job: z.object({
                status: JobStatus,
                started_at: z.string().datetime().nullable(),
                completed_at: z.string().datetime().nullable(),
                error_reason: z.string().nullable(),
              }).nullable(),
              latest_protocol_job: z.object({
                status: JobStatus,
                started_at: z.string().datetime().nullable(),
                completed_at: z.string().datetime().nullable(),
                error_reason: z.string().nullable(),
              }).nullable(),
              transcript_exists: z.boolean(),
              protocol_exists: z.boolean(),
            });
            export type MeetingDetailResponse = z.infer<typeof MeetingDetailResponse>;

            // SSE event payload (consumed by FE, emitted by BE via TECH-012)
            export const MeetingStatusEvent = z.object({
              type: z.literal('meeting.status'),
              meeting_id: z.string().uuid(),
              status: MeetingStatus,
              error_reason: z.string().nullable().optional(),
            });
            export type MeetingStatusEvent = z.infer<typeof MeetingStatusEvent>;"""),
        "UC-003": dedent("""\
            export const MeetingDeleteResponse = z.object({
              deleted: z.literal(true),
              in_flight_failed: z.boolean(), // true if any job was IN_PROGRESS at delete time (RQ-007)
            });
            export type MeetingDeleteResponse = z.infer<typeof MeetingDeleteResponse>;"""),
        "UC-100": dedent("""\
            // TUS metadata header (Base64 KV pairs):
            //   filename, mime_type, size_bytes, title?, language?
            // Server validates per RQ-008/009/010 at pre-create.
            export const UploadFinalizeResponse = z.object({
              meeting_id: z.string().uuid(),
              status: z.literal('TRANSCRIBING'),
            });
            export type UploadFinalizeResponse = z.infer<typeof UploadFinalizeResponse>;

            // Used as request shape for client-side validation BEFORE TUS create.
            export const UploadCreateRequest = z.object({
              filename: z.string().min(1),
              size_bytes: z.number().int().positive().max(524_288_000), // RQ-008
              mime_type: VideoMimeType, // RQ-009
              title: z.string().optional(),
              language: MeetingLanguage.optional(), // omit/null -> auto-detect per RQ-012
            });
            export type UploadCreateRequest = z.infer<typeof UploadCreateRequest>;"""),
        "UC-200": dedent("""\
            // BullMQ queue: 'transcriptionJob'
            export const TranscriptionJobPayload = z.object({
              transcription_job_id: z.string().uuid(),
            });
            export type TranscriptionJobPayload = z.infer<typeof TranscriptionJobPayload>;

            // Internal worker result (not exposed via HTTP)
            export const TranscriptionResult = z.object({
              transcript_id: z.string().uuid(),
              segments_count: z.number().int(),
              speakers_count: z.number().int(),
              language: MeetingLanguage,
              speaker_map: z.record(z.string(), z.string().nullable()).nullable(),
            });
            export type TranscriptionResult = z.infer<typeof TranscriptionResult>;"""),
        "UC-201": dedent("""\
            export const TranscriptResponse = z.object({
              id: z.string().uuid(),
              meeting_id: z.string().uuid(),
              full_text: z.string(),
              segments_count: z.number().int(),
              speakers_count: z.number().int(),
              language: MeetingLanguage,
              speaker_map: z.record(z.string(), z.string().nullable()).nullable(),
              created_at: z.string().datetime(),
            });
            export type TranscriptResponse = z.infer<typeof TranscriptResponse>;"""),
        "UC-300": dedent("""\
            // BullMQ queue: 'protocolGenerationJob'
            export const ProtocolGenerationJobPayload = z.object({
              protocol_generation_job_id: z.string().uuid(),
            });
            export type ProtocolGenerationJobPayload = z.infer<typeof ProtocolGenerationJobPayload>;"""),
        "UC-301": dedent("""\
            export const ProtocolResponse = z.object({
              id: z.string().uuid(),
              meeting_id: z.string().uuid(),
              markdown_content: z.string(),
              version: z.number().int().min(1),
              edit_count: z.number().int().min(0),
              generated_at: z.string().datetime(),
              last_edited_at: z.string().datetime().nullable(),
            });
            export type ProtocolResponse = z.infer<typeof ProtocolResponse>;

            export const ProtocolSaveRequest = z.object({
              markdown_content: z.string().min(1), // canonical Markdown per BRQ-018
            });
            export type ProtocolSaveRequest = z.infer<typeof ProtocolSaveRequest>;

            export const ProtocolSaveResponse = z.object({
              version: z.number().int().min(2), // initial = 1, first save = 2
              edit_count: z.number().int().min(1),
              last_edited_at: z.string().datetime(),
              meeting_status: z.literal('EDITED'),
            });
            export type ProtocolSaveResponse = z.infer<typeof ProtocolSaveResponse>;"""),
        "UC-302": dedent("""\
            // No JSON body — response is application/pdf (binary).
            // Content-Disposition: attachment; filename="<meeting-title>-protocol-v<version>.pdf"

            export const PdfExportError = z.object({
              code: z.literal('PDF_RENDER_FAILED'),
              message: z.string(),
            });
            export type PdfExportError = z.infer<typeof PdfExportError>;"""),
    }
    return schemas.get(uc_id, "// No additional types beyond shared DTOs.")


def uc_error_table(uc_id: str) -> str:
    common = "| 500 | `INTERNAL_ERROR` | Unhandled server failure |\n"
    tables = {
        "UC-001": "| 500 | `INTERNAL_ERROR` | DB failure |",
        "UC-002": "| 404 | `MEETING_NOT_FOUND` | id does not exist |\n| 500 | `INTERNAL_ERROR` | DB failure |",
        "UC-003": "| 404 | `MEETING_NOT_FOUND` | id does not exist |\n| 500 | `STORAGE_DELETE_FAILED` | EXT-04 object removal failed |\n| 500 | `INTERNAL_ERROR` | unhandled |",
        "UC-100": "| 413 | `FILE_TOO_LARGE` | size_bytes > 524288000 (RQ-008) |\n| 415 | `UNSUPPORTED_MIME` | mime_type not in {video/mp4, video/x-matroska, video/quicktime} (RQ-009) |\n| 422 | `CONTAINER_INVALID` | ffprobe rejected the container (RQ-010) |\n| 500 | `STORAGE_WRITE_FAILED` | S3 putObject failure |\n| 500 | `INTERNAL_ERROR` | unhandled |",
        "UC-200": "_Worker UC — failures are written to TranscriptionJob.error_reason (RQ-015), not HTTP. See system steps ALT path._",
        "UC-201": "| 404 | `TRANSCRIPT_NOT_FOUND` | no Transcript for meeting |\n| 409 | `STATUS_NOT_READY` | Meeting.status < TRANSCRIPT_READY |\n| 500 | `INTERNAL_ERROR` | DB failure |",
        "UC-300": "_Worker UC — failures are written to ProtocolGenerationJob.error_reason (RQ-026), not HTTP. See system steps ALT path._",
        "UC-301": "| 404 | `PROTOCOL_NOT_FOUND` | no Protocol for meeting |\n| 409 | `STATUS_NOT_READY` | Meeting.status not in {PROTOCOL_READY, EDITED} (RQ-029) |\n| 400 | `VALIDATION_FAILED` | markdown_content missing/empty |\n| 500 | `INTERNAL_ERROR` | DB failure |",
        "UC-302": "| 404 | `PROTOCOL_NOT_FOUND` | no Protocol for meeting |\n| 409 | `STATUS_NOT_READY` | Meeting.status not in {PROTOCOL_READY, EDITED} |\n| 500 | `PDF_RENDER_FAILED` | Puppeteer render failure (RQ-033) |",
    }
    return tables.get(uc_id, common)


# ---- test-spec.md (BE) --------------------------------------------------
def render_test_spec_be(uc_id: str, uc: dict) -> str:
    is_worker = uc["actor"] == "SYSTEM"
    cases = []
    cases.append(f"# {uc_id} — Backend Test Spec\n")
    cases.append(f"**UC:** {uc['name']}  ·  **Wave:** {uc['wave_be']}\n")
    cases.append("Test framework: **Vitest** + supertest (HTTP) / BullMQ test harness (worker).\n")
    cases.append("Each test references an RQ ID. Add new tests when adding new RQs.\n")

    cases.append("## Test scenarios\n")
    for i, (rid, _t, _p, desc) in enumerate(uc["requirements"], 1):
        cases.append(f"### T{i:02d}. {rid} — {desc.split('. ')[0]}.")
        cases.append("```ts")
        cases.append(f"// {rid}: {desc}")
        cases.append("// Setup -> Action -> Assert")
        cases.append("// (Implement against the endpoint / worker handler in task-be.md.)")
        cases.append("```")
        cases.append("")

    cases.append("## Integration tests\n")
    if is_worker:
        cases.append("- Full job lifecycle: enqueue payload -> worker handles -> COMPLETED with correct Transcript/Protocol persisted.")
        cases.append("- Failure path: stub provider to throw -> job FAILED with error_reason, Meeting.status FAILED, no re-enqueue.")
        cases.append("- Concurrency: BullMQ concurrency=1 honored per NFR-009.")
    else:
        cases.append("- Endpoint smoke: each endpoint returns the documented success shape under happy-path setup.")
        cases.append("- Each error code in `api-contract.md` is reachable via at least one negative test.")
        cases.append("- Status-driven gating (RQ-005 / RQ-029) covered by parametrized tests over MeetingStatus enum values.")

    cases.append("\n## Verification command\n")
    cases.append(f"```bash\npnpm --filter api test -- {uc_id.lower()}\n# or, for workers:\npnpm --filter worker test -- {uc_id.lower()}\n```\n")
    return "\n".join(cases) + "\n"


# ---- test-spec-fe.md ----------------------------------------------------
def render_test_spec_fe(uc_id: str, uc: dict) -> str:
    if not uc["has_fe"]:
        return dedent(f"""\
            # {uc_id} — Frontend Test Spec (N/A)

            This UC has no dedicated frontend; no FE tests apply at this UC. UI interactions are tested under host UCs (UC-002 / UC-301 for {uc_id}).
        """)
    out = [f"# {uc_id} — Frontend Test Spec\n", f"**UC:** {uc['name']}\n",
           "Framework: **Vitest** (component) + **Playwright** (E2E).\n",
           "## Component tests"]
    for i, (n, lbl, t, req, _note) in enumerate([f for f in uc["form_fields"] if f[2] not in ("header", "button", "alert")], 1):
        out.append(f"### CT{i:02d}. `{n}` field renders + validates")
        out.append(f"- Field type: `{t}`")
        out.append(f"- Required: `{req}`")
        out.append(f"- Asserts label `{lbl}` (RU + EN via i18next).")
        out.append("")

    out.append("## E2E user-flow tests (Playwright)")
    out.append("")
    for i, step in enumerate(uc["user_steps"], 1):
        out.append(f"### E2E{i:02d}. Step {i}")
        out.append(f"- Action: {step}")
        out.append("")

    out.append("## Acceptance coverage")
    for ac in uc["acceptance"]:
        out.append(f"- {ac}")
    out.append("")
    out.append("Run: `pnpm --filter web test` (component) and `/nacl-tl-qa " + uc_id + "` (E2E).")
    return "\n".join(out) + "\n"


# ---- impl-brief.md (BE) -------------------------------------------------
def render_impl_brief_be(uc_id: str, uc: dict) -> str:
    is_worker = uc["actor"] == "SYSTEM"
    sec = [f"# {uc_id} — Backend Implementation Brief\n", f"**UC:** {uc['name']}\n"]
    sec.append("## File plan\n")
    if is_worker:
        sec.append(f"- `worker/src/jobs/{uc_id.lower()}.ts` — Worker handler\n- `worker/src/jobs/{uc_id.lower()}.test.ts` — Unit + integration tests")
    else:
        slug = uc_id.lower()
        sec.append(f"- `api/src/routes/{slug}.ts` — Fastify route handlers\n- `api/src/services/{slug}.service.ts` — Service layer (DB tx + business rules)\n- `api/src/services/{slug}.service.test.ts` — Service unit tests\n- `api/src/routes/{slug}.test.ts` — Route integration tests (supertest)")
    sec.append("")
    sec.append("## Steps\n")
    for i, s in enumerate(uc["system_steps"], 1):
        sec.append(f"{i}. {s}")
    sec.append("")
    sec.append("## Cross-cutting\n")
    sec.append("- All Prisma writes that touch Meeting.status MUST go through a single transaction with the relevant child write (BRQ-008 mirror).")
    sec.append("- All errors throw `AppError(code, http, message)` — never return ad-hoc objects.")
    sec.append("- Each RQ ID referenced by a code comment on the line that satisfies it.")
    if is_worker:
        sec.append("- Worker handlers MUST be idempotent under BullMQ retry semantics; check job.status before mutating.")
        sec.append("- Terminal-state writes (COMPLETED / FAILED) require a guard `WHERE status='IN_PROGRESS'` (BRQ-009).")
    return "\n".join(sec) + "\n"


# ---- impl-brief-fe.md ---------------------------------------------------
def render_impl_brief_fe(uc_id: str, uc: dict) -> str:
    if not uc["has_fe"]:
        return f"# {uc_id} — Frontend Implementation Brief (N/A)\n\nNo FE work for this UC. See `task-fe.md`.\n"
    out = [f"# {uc_id} — Frontend Implementation Brief\n", f"**UC:** {uc['name']}\n"]
    slug = uc_id.lower()
    out.append("## File plan\n")
    out.append(f"- `web/src/routes/{slug}.tsx` — Page-level component (route handler)")
    out.append(f"- `web/src/features/{slug}/components/` — Form & view components built on shadcn/ui")
    out.append(f"- `web/src/features/{slug}/hooks/use{uc_id.replace('-', '')}.ts` — TanStack Query hooks consuming `api-contract.md`")
    out.append(f"- `web/src/features/{slug}/*.test.tsx` — Component tests")
    out.append("")
    out.append("## Steps\n")
    for i, s in enumerate(uc["user_steps"], 1):
        out.append(f"{i}. {s}")
    out.append("")
    out.append("## Cross-cutting\n")
    out.append("- All API calls go through `apiClient` (TECH-013); never inline `fetch`.")
    out.append("- All copy localized via i18next (RU + EN). Keys in `web/src/i18n/{ru,en}.json`.")
    out.append("- Status-driven UI gating uses the shared `MeetingStatus` enum from `@transcrib/shared`.")
    out.append("- Long-running state subscribes to the `meeting.status` SSE stream (TECH-012) and patches the TanStack Query cache via `setQueryData`.")
    out.append("- Form validation mirrors BE Zod schemas (import from `@transcrib/shared`).")
    return "\n".join(out) + "\n"


# ---- acceptance.md ------------------------------------------------------
def render_acceptance(uc_id: str, uc: dict) -> str:
    body = [f"# {uc_id} — Acceptance Criteria\n", f"**UC:** {uc['name']}\n", "## Criteria\n"]
    for ac in uc["acceptance"]:
        body.append(f"- [ ] {ac}")
    body.append("")
    body.append("## Tied to requirements\n")
    for rid, _t, _p, desc in uc["requirements"]:
        body.append(f"- **{rid}** — {desc}")
    body.append("\n## Sign-off\n")
    body.append("- [ ] BE tests in `test-spec.md` all pass.")
    if uc["has_fe"]:
        body.append("- [ ] FE tests in `test-spec-fe.md` all pass.")
        body.append(f"- [ ] `/nacl-tl-qa {uc_id}` end-to-end run is green.")
    body.append("- [ ] `/nacl-tl-review` BE and FE both APPROVED.")
    return "\n".join(body) + "\n"


# ---- TECH renderers -----------------------------------------------------
def render_tech_task(t: dict) -> str:
    deliv = "\n".join(f"- {d}" for d in t["deliverables"])
    tests = "\n".join(f"- {d}" for d in t["tests"])
    return f"""---
id: {t['id']}
title: {t['title']}
type: tech
wave: {t['wave']}
priority: high
depends_on: {t['deps']}
---

# {t['id']} — {t['title']}

## What

{t['what']}

## Deliverables

{deliv}

## Verification

{tests}

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
"""


def render_tech_test(t: dict) -> str:
    body = "\n".join(f"- {d}" for d in t["tests"])
    return f"# {t['id']} — Test Spec\n\n## Acceptance tests\n\n{body}\n"


def render_tech_impl(t: dict) -> str:
    body = "\n".join(t["steps"])
    return f"# {t['id']} — Implementation Brief\n\n## Step plan\n\n{body}\n"


# =========================================================================
# WRITE
# =========================================================================

def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main() -> None:
    # TECH tasks (15 × 3 files)
    for t in TECH:
        d = ROOT / t["id"]
        write(d / "task.md", render_tech_task(t))
        write(d / "test-spec.md", render_tech_test(t))
        write(d / "impl-brief.md", render_tech_impl(t))

    # UC tasks (9 × 8 files)
    for uc_id, uc in UCS.items():
        d = ROOT / uc_id
        write(d / "task-be.md", render_task_be(uc_id, uc))
        write(d / "task-fe.md", render_task_fe(uc_id, uc))
        write(d / "api-contract.md", render_api_contract(uc_id, uc))
        write(d / "test-spec.md", render_test_spec_be(uc_id, uc))
        write(d / "test-spec-fe.md", render_test_spec_fe(uc_id, uc))
        write(d / "impl-brief.md", render_impl_brief_be(uc_id, uc))
        write(d / "impl-brief-fe.md", render_impl_brief_fe(uc_id, uc))
        write(d / "acceptance.md", render_acceptance(uc_id, uc))

    total = sum(1 for _ in ROOT.rglob("*.md"))
    print(f"Generated {total} task files under {ROOT}")


if __name__ == "__main__":
    main()
