<!-- Instructions in English for optimal AI performance. User communicates in their preferred language. -->

# Transcrib

## Project Overview

- **Name:** Transcrib
- **Description:** Transcription of large video files with speaker diarization and automated meeting report generation.
- **Stack** (finalized 2026-05-18, see ADR-001..ADR-011 in graph):
  - **Backend:** Node 20 LTS + Fastify 5 + TypeScript + Zod
  - **DB/ORM:** PostgreSQL 16 + Prisma (JSONB for transcript segments)
  - **Queue:** BullMQ + Redis 7 (separate worker process)
  - **Object storage:** MinIO (S3-compatible, swap to AWS S3/R2 via env)
  - **Upload:** TUS protocol (`@tus/server` + `tus-js-client`)
  - **Audio:** ffmpeg via `fluent-ffmpeg`
  - **ASR:** Deepgram Nova-3 (RU+EN + diarization), behind `IAsrProvider`
  - **LLM:** kie.ai — Claude Sonnet 4.6 (default) / GPT-5.4, behind `ILlmProvider`, user-switchable per meeting
  - **Realtime:** Server-Sent Events (Fastify native)
  - **Frontend:** Vite 5 + React 19 + TypeScript + shadcn/ui + Tailwind + TanStack Query v5 + React Router 7
  - **Markdown:** Milkdown (WYSIWYG edit) + react-markdown (render)
  - **PDF export:** Puppeteer (transient, never persisted)
  - **i18n:** i18next + react-i18next (RU/EN)
  - **Testing:** Vitest + Playwright (E2E)
  - **Repo:** pnpm workspaces — `api/`, `worker/`, `web/`, `shared/`
  - **Deployment:** Docker Compose (single VM for MVP)

## Development Workflow

Full project lifecycle:

1. **Business Analysis** → /nacl-ba-full (processes, entities, roles, rules — stored in Neo4j)
2. **Design** → /nacl-sa-full (architecture, UC, domain model, interfaces — stored in Neo4j)
3. **Planning** → /nacl-tl-plan (tasks, waves, dependencies, api-contracts from graph)
4. **Development** → /nacl-tl-full or /nacl-tl-dev-be + /nacl-tl-dev-fe (TDD, code review)
5. **Bug Fixing** → /nacl-tl-fix "problem description" (spec-first)
6. **Diagnostics** → /nacl-tl-diagnose (for systemic issues)
7. **Reconciliation** → /nacl-tl-reconcile (for large-scale docs/code drift)
8. **QA** → /nacl-tl-qa UC### (E2E testing)

## Bug Fix Protocol

When a bug is discovered:
1. Run `/nacl-tl-fix "problem description"`
2. The skill automatically identifies affected UCs, docs, and code via Neo4j graph
3. Level classification:
   - **L1 (Code-only):** docs are up to date, bug is in implementation → fix code only
   - **L2 (Spec-sync):** docs are outdated → update docs FIRST, then code
   - **L3 (Spec-create):** docs are missing → create spec FIRST, then code

### Spec-First Principle

Specification = source of truth. When docs and code diverge — the code is wrong.
For L2/L3 fixes: FIRST define the correct behavior in documentation,
THEN write code that conforms to that behavior.

### Prohibited Actions

- Fixing code without checking Neo4j graph for spec accuracy
- Editing docs directly, bypassing SA/TL skills
- Creating "stubs" in docs (empty UCs, TODO specifications)
- Bypassing the .tl/ workflow ("no task exists, I'll just write it directly")
- Ignoring spec vs code discrepancies during a fix

## Skill Routing

| Situation | Skill | Description |
|-----------|-------|-------------|
| Business analysis from scratch | /nacl-ba-full | Full BA cycle (Neo4j graph) |
| Business process | /nacl-ba-process | Business process mapping |
| Business entities | /nacl-ba-entities | Business object descriptions |
| Business rules | /nacl-ba-rules | Catalog of constraints, calculations, invariants |
| System context | /nacl-ba-context | System boundaries, stakeholders, external entities |
| BA validation | /nacl-ba-validate | BA artifact validation (L1-L8 + XL1-XL5) |
| Design from scratch | /nacl-sa-full | Full specification (Neo4j graph) |
| Use Case | /nacl-sa-uc UC### | UC detail: activity diagram, forms, requirements |
| Domain Model | /nacl-sa-domain | Entities, relationships, statuses, business rules |
| Architecture | /nacl-sa-architect | Modules, bounded contexts, NFR |
| Interfaces | /nacl-sa-ui | Navigation, components, layout |
| SA validation | /nacl-sa-validate | Specification validation (L1-L6, XL6-XL9) |
| Development plan | /nacl-tl-plan | Tasks, waves, dependencies, api-contracts |
| Full dev cycle | /nacl-tl-full | Autonomous orchestration BE+FE+review+QA |
| Backend development | /nacl-tl-dev-be UC### | TDD backend |
| Frontend development | /nacl-tl-dev-fe UC### | TDD frontend |
| Infrastructure | /nacl-tl-dev TECH### | TECH tasks |
| **Bug** | **/nacl-tl-fix "description"** | **Spec-first bug fixing with graph sync** |
| **Everything is broken** | **/nacl-tl-diagnose** | **Project state diagnostics** |
| **Docs/code drift** | **/nacl-tl-reconcile** | **Emergency alignment of spec and code** |
| Code review | /nacl-tl-review UC### --be/--fe | BE/FE review |
| Project status | /nacl-tl-status | Progress, blockers, waves |
| Next task | /nacl-tl-next | Recommendation based on waves and dependencies |
| Release preparation | /nacl-tl-stubs --final | Check for stubs, mocks, placeholders |
| QA | /nacl-tl-qa UC### | E2E testing via MCP Playwright |
| Task documentation | /nacl-tl-docs UC### | Update docs after implementation |
| Board → graph sync | /nacl-ba-from-board | Import/sync Excalidraw boards to Neo4j |
| Graph → Markdown | /nacl-render | Render spec from graph to markdown files |
| Publish to Docmost | /nacl-publish | Push rendered docs to Docmost |

## Documentation Rules

1. **Neo4j graph = source of truth.** All BA and SA specifications live in Neo4j — not in loose markdown files.
2. **Docs are changed ONLY through skills:** /nacl-sa-uc, /nacl-sa-domain, /nacl-tl-fix, /nacl-tl-reconcile, /nacl-tl-docs.
3. **Spec-first:** When fixing a bug that changes behavior (L2/L3) — graph spec FIRST, THEN code.
4. **No ad-hoc docs:** If no task exists in .tl/ — CREATE a task instead of bypassing the workflow.
5. **Artifact hierarchy:** BA → SA → TL → Code. Each level follows the previous one.

## Graph Infrastructure

Neo4j is running locally for this project:
- **Browser:** http://localhost:3614
- **Bolt:** bolt://localhost:3627
- **Credentials:** neo4j / neo4j_graph_dev
- **Container:** transcrib-neo4j
- **MCP config:** `.mcp.json` at project root

Connection is managed by the MCP server — skills do NOT pass connection strings.

## Architecture Conventions

- **Provider abstractions:** Both `IAsrProvider` (ADR-006) and `ILlmProvider` (ADR-007) live in `shared/`. New ASR or LLM vendors are added by writing a new adapter — never call vendor SDKs directly from `api/` or `worker/`.
- **Shared types:** All DTOs are defined as Zod schemas in `shared/`. BE uses them via `fastify-type-provider-zod`; FE imports the inferred TS types directly.
- **Job state machine:** Lives in the worker. The API never mutates terminal-state jobs (enforced at the Prisma layer per BRQ-009).
- **Storage URI:** All references to stored files use `s3://bucket/key` shape, regardless of whether MinIO or AWS S3 is the backend (ADR-004).
- **Realtime:** SSE only. No WebSocket. Status streams from `GET /api/meetings/:id/events` (ADR-010).

## Deployment

- **Local dev / single-VM MVP:** Docker Compose with services `api`, `worker`, `postgres`, `redis`, `minio`, `neo4j` (for skills only).
- **Production swap:** MinIO → AWS S3 / Cloudflare R2 via env vars (`S3_ENDPOINT`, `S3_BUCKET`, `S3_KEY`, `S3_SECRET`). No code changes.
- **Secrets:** `.env` for dev, Docker secrets or platform secret store for prod. Required keys: `DEEPGRAM_API_KEY`, `KIE_API_KEY`, `DATABASE_URL`, `REDIS_URL`, S3 credentials.
