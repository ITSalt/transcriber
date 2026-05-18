---
id: TECH-005
title: Fastify API scaffold
type: tech
wave: 0
priority: high
depends_on: ['TECH-001', 'TECH-004']
---

# TECH-005 — Fastify API scaffold

## What

Bootstrap Fastify 5 with fastify-type-provider-zod, structured error handler, Pino logger, request-id correlation, and /health endpoint.

## Deliverables

- api/src/server.ts wiring zod-type-provider, error handler, plugins
- api/src/plugins/logger.ts (Pino with redaction of credentials)
- api/src/plugins/errors.ts: maps thrown AppError -> JSON {code, message, details?} with HTTP status
- api/src/routes/health.ts -> GET /health returns {status:'ok', db:'ok', redis:'ok'} (probes both)
- api/src/config.ts loads env via Zod

## Verification

- GET /health returns 200 with all probes green
- Throwing AppError('VALIDATION_FAILED', 400, ...) yields JSON error body
- Invalid request body (zod fail) yields 400 with field-level details

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
