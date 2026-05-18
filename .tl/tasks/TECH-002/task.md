---
id: TECH-002
title: Docker Compose dev stack
type: tech
wave: 0
priority: high
depends_on: ['TECH-001']
---

# TECH-002 — Docker Compose dev stack

## What

Stand up the local dev infra: Postgres 16, Redis 7, MinIO. Reuse existing transcrib-neo4j container (already running for skills).

## Deliverables

- docker-compose.yml at repo root with services: postgres, redis, minio (and named volumes)
- MinIO console exposed on host (default :9001); buckets auto-created via initContainer / mc
- .env.example documenting DATABASE_URL, REDIS_URL, S3_ENDPOINT/S3_KEY/S3_SECRET/S3_BUCKET
- make dev-up / make dev-down scripts

## Verification

- docker compose up -d brings all services healthy within 60s
- psql DATABASE_URL -c 'SELECT 1' returns 1
- redis-cli -u REDIS_URL PING returns PONG
- mc ls minio/transcrib lists the created bucket

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
