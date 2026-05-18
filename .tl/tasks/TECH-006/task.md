---
id: TECH-006
title: BullMQ + worker process scaffold
type: tech
wave: 0
priority: high
depends_on: ['TECH-002', 'TECH-005']
---

# TECH-006 — BullMQ + worker process scaffold

## What

Bootstrap BullMQ queues and a worker process. Define queue contract for transcriptionJob and protocolJob; wire to Redis from TECH-002.

## Deliverables

- worker/src/index.ts boots Worker instances for queues
- shared/src/queues.ts: QueueName enum, JobPayload Zod schemas
- api/src/queue.ts produces Queue instances and a `enqueue(name, payload)` helper
- Job concurrency = 1 per worker per NFR-009 (one video at a time)
- Failed-job handler logs error_reason and updates the corresponding DB job record

## Verification

- enqueue('transcriptionJob', {...}) -> worker receives, runs handler (echo handler at this stage)
- Worker handler throwing sets job to failed in Bull

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
