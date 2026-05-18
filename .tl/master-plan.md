# Master Plan — Transcrib

**Generated:** 2026-05-18
**Source:** Neo4j graph (`/nacl-tl-plan`)
**Modules:** 4
**Use Cases:** 9
**Tasks:** 30 (15 TECH + 15 UC tasks across BE/FE/worker)
**Waves:** 6

## Module structure

| Module | UCs | Entities | Description |
|--------|-----|----------|-------------|
| `mod-common` (Common / Shell) | 3 | 1 | Catalog, detail, delete; Meeting root aggregate |
| `mod-ingest` (Video Ingest) | 1 | 1 | TUS chunked upload, validation, Recording entity |
| `mod-transcription` (Transcription) | 2 | 2 | ASR+diarization pipeline; transcript view/download |
| `mod-protocol` (Protocol Lifecycle) | 3 | 2 | LLM-based protocol generation; Markdown editor; PDF export |

## Task list

### UC tasks

| UC | Title | Module | BE wave | FE wave | Depends on |
|----|-------|--------|---------|---------|------------|
| UC-001 | View meeting catalog | mod-common | 1 | 2 | TECH-003, TECH-005 |
| UC-002 | View meeting detail | mod-common | 2 | 3 | UC-001-BE |
| UC-003 | Delete meeting | mod-common | 3 | 4 | UC-002-BE |
| UC-100 | Upload meeting video | mod-ingest | 1 | 2 | TECH-003/005/007/008 |
| UC-200 | Transcription pipeline (worker) | mod-transcription | 2 | — | UC-100-BE, TECH-006/009/010/012 |
| UC-201 | View and download transcript | mod-transcription | 3 | 4 | UC-200-BE |
| UC-300 | Protocol generation (worker) | mod-protocol | 3 | — | UC-200-BE, TECH-011 |
| UC-301 | Review and edit protocol | mod-protocol | 4 | 5 | UC-300-BE |
| UC-302 | Export protocol to PDF | mod-protocol | 5 | — | UC-301-BE, TECH-014 |

UC-200 and UC-300 are SYSTEM-actor worker UCs (no FE). UC-302 has no dedicated FE — UI hooks live in UC-002-FE and UC-301-FE forms.

### TECH tasks

| Task | Title | Wave | Depends on |
|------|-------|------|------------|
| TECH-001 | Monorepo & tooling | 0 | — |
| TECH-002 | Docker Compose dev stack | 0 | TECH-001 |
| TECH-003 | Prisma schema & migrations | 0 | TECH-001, TECH-002 |
| TECH-004 | Shared Zod schemas + DTOs | 0 | TECH-001 |
| TECH-005 | Fastify API scaffold | 0 | TECH-001, TECH-004 |
| TECH-006 | BullMQ + worker scaffold | 0 | TECH-002, TECH-005 |
| TECH-007 | S3/MinIO storage adapter | 0 | TECH-005 |
| TECH-008 | TUS upload wiring | 0 | TECH-005, TECH-007 |
| TECH-009 | ffmpeg audio extraction | 0 | TECH-006 |
| TECH-010 | IAsrProvider + Deepgram adapter | 0 | TECH-006 |
| TECH-011 | ILlmProvider + kie.ai adapter | 0 | TECH-006 |
| TECH-012 | SSE event stream | 0 | TECH-005 |
| TECH-013 | Web scaffold (Vite + React + shadcn) | 0 | TECH-001, TECH-004 |
| TECH-014 | Puppeteer PDF renderer | 0 | TECH-005 |
| TECH-015 | GitHub Actions CI | 0 | TECH-001 |

## Execution waves

### Wave 0 — Foundation & infrastructure (15 TECH tasks)
Topo-sorted internally by `depends_on`. Recommended order:
1. TECH-001 → TECH-002 → TECH-003
2. In parallel: TECH-004, TECH-015
3. TECH-005 → TECH-007 → TECH-008
4. TECH-006 → TECH-009 / TECH-010 / TECH-011
5. TECH-012, TECH-013, TECH-014

Definition of done for the wave: every UC in waves 1+ has its TECH dependencies satisfied.

### Wave 1 — Core BE (catalog + upload)
| Task | Agent | Depends on |
|------|-------|------------|
| UC-001-BE | nacl-tl-dev-be | TECH-003, TECH-005 |
| UC-100-BE | nacl-tl-dev-be | TECH-003, TECH-005, TECH-007, TECH-008 |

### Wave 2 — Detail BE + first FE + transcription pipeline
| Task | Agent | Depends on |
|------|-------|------------|
| UC-001-FE | nacl-tl-dev-fe | UC-001-BE, TECH-013 |
| UC-100-FE | nacl-tl-dev-fe | UC-100-BE, TECH-013 |
| UC-002-BE | nacl-tl-dev-be | UC-001-BE |
| UC-200-BE | nacl-tl-dev-be | UC-100-BE, TECH-006, TECH-009, TECH-010, TECH-012 |

### Wave 3 — Detail FE + delete BE + transcript BE + protocol pipeline
| Task | Agent | Depends on |
|------|-------|------------|
| UC-002-FE | nacl-tl-dev-fe | UC-002-BE, TECH-013 |
| UC-003-BE | nacl-tl-dev-be | UC-002-BE |
| UC-201-BE | nacl-tl-dev-be | UC-200-BE |
| UC-300-BE | nacl-tl-dev-be | UC-200-BE, TECH-011 |

### Wave 4 — Delete FE + transcript FE + protocol editor BE
| Task | Agent | Depends on |
|------|-------|------------|
| UC-003-FE | nacl-tl-dev-fe | UC-003-BE, TECH-013 |
| UC-201-FE | nacl-tl-dev-fe | UC-201-BE, TECH-013 |
| UC-301-BE | nacl-tl-dev-be | UC-300-BE |

### Wave 5 — Protocol editor FE + PDF export
| Task | Agent | Depends on |
|------|-------|------------|
| UC-301-FE | nacl-tl-dev-fe | UC-301-BE, TECH-013 |
| UC-302-BE | nacl-tl-dev-be | UC-301-BE, TECH-014 |

## Critical path

`TECH-001 → TECH-005 → TECH-007 → TECH-008 → UC-100-BE → UC-200-BE → UC-300-BE → UC-301-BE → UC-302-BE`

9 nodes deep. Anything that lengthens this chain delays MVP.

## Open questions

- **NFR-007 (no auth at MVP)** is intentional but means RQ-003 ownership scope is semantically "all" until auth is added. Re-introduce when adding auth.
- **NFR-009 (one video per session)** caps worker concurrency at 1. Re-evaluate when scaling to multi-user.
- **BRQ-003 container integrity probe** is "TBD per BRQ-003 assumption" — TECH-009 / UC-100-BE implement ffprobe + short-sample read; revisit if false-reject rate is high.

## Next task

Start Wave 0 with `/nacl-tl-dev TECH-001`.

After Wave 0 is green, run `/nacl-tl-next` to pick the next task.

---

## Production deployment (added 2026-05-18)

Full architecture document: **`.tl/deploy-plan.md`**.

Target host: `82.202.156.157` (Ubuntu 24.04), domain `transcriber.itsalt.ru`. Server already runs `learn.itsalt.ru` + Mattermost — plan is strictly additive (separate Postgres role + DB, separate Redis logical DB `/1`, separate Cloud.ru S3 bucket + service account, separate pm2 apps, new Caddy server-block).

### Deploy TECH tasks

| Task | Title | Owner | Wave | Depends on |
|------|-------|-------|------|------------|
| TECH-016 | Cloud.ru S3 bucket + service account | user (manual) | 7 | — |
| TECH-017 | Server bootstrap (swap, Node 20, pnpm, ffmpeg, chromium) | ops | 7 | — |
| TECH-018 | Postgres role + Redis DB index + filesystem layout + `.env` | ops | 8 | TECH-016, TECH-017 |
| TECH-019 | `ecosystem.config.cjs` (pm2 api + worker) | dev | 7 | TECH-001 |
| TECH-020 | Caddy server-block for transcriber.itsalt.ru | ops | 8 | TECH-018 |
| TECH-021 | S3 Cloud.ru profile + puppeteer-core wiring | dev | 7 | TECH-007, TECH-014 |
| TECH-022 | `/api/health` + graceful shutdown (SIGTERM) | dev | 7 | TECH-005 |
| TECH-023 | GitHub Actions `deploy-production.yml` + repo secrets | dev | 9 | TECH-018, TECH-019, TECH-022 |
| TECH-024 | DNS + first cutover + smoke test runbook | user + ops | 10 | all above |

### Deploy waves

- **Wave 7 — Prepare in parallel** (user, server, code): TECH-016, TECH-017, TECH-019, TECH-021, TECH-022.
- **Wave 8 — Wire it up on the server**: TECH-018, TECH-020.
- **Wave 9 — Automate the pipeline**: TECH-023.
- **Wave 10 — Production cutover**: TECH-024.

UC feature waves 0–5 must be green before TECH-024 fires the first real cutover.

### Open follow-up questions (to confirm before TECH-018 starts)

1. Соглашается ли владелец на root-команды через автоматизированный SSH, или предпочитает сам выполнять `sudo`-шаги по чек-листам?
2. GitHub-секреты: разделять `TRANSCRIB_PROD_*` от `PRODUCTION_*` (learn) или переиспользовать один SSH-ключ под разными именами?
3. Имя github-org для clone в TECH-018 (предположительно `itsalt`).

Эти вопросы не блокируют TECH-016 (создание bucket) — можно начинать его параллельно.
