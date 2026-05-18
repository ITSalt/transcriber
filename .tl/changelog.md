# Changelog — .tl/

## [PLAN] 2026-05-18

- Created development plan from the Neo4j graph (`/nacl-tl-plan`, scope=full).
- Generated 9 UC tasks (BE+FE per UC; SYSTEM-actor UC-200/UC-300 are BE-only worker tasks; UC-302 is BE-only with UI hooks in UC-002/UC-301 FE).
- Generated 15 TECH tasks covering full-stack infrastructure (monorepo, Docker stack, Prisma, shared Zod, Fastify, BullMQ, S3/MinIO, TUS, ffmpeg, Deepgram ASR, kie.ai LLM, SSE, web scaffold, Puppeteer PDF, CI).
- Defined 6 execution waves with dependency-honoring topological ordering.
- API contracts authored for all 9 UCs with Zod schemas, error tables, and authentication notes (NFR-007 no-auth at MVP).
- Source: Neo4j SA layer — 4 modules, 9 UCs, 6 domain entities, 53 requirements, 2 system roles, 4 enums.
- Neo4j TL layer populated: 6 Wave nodes, 30 Task nodes, IN_WAVE/DEPENDS_ON/GENERATES edges.
- 117 task files written under `.tl/tasks/`.
