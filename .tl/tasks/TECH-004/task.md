---
id: TECH-004
title: Shared Zod schemas, DTOs, enums
type: tech
wave: 0
priority: high
depends_on: ['TECH-001']
---

# TECH-004 — Shared Zod schemas, DTOs, enums

## What

Author Zod schemas for all DTOs and enums in shared/. Export inferred TS types for BE and FE consumption.

## Deliverables

- shared/src/enums.ts: MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType as z.enum + TS types
- shared/src/dto/*.ts: MeetingDto, RecordingDto, TranscriptDto, ProtocolDto, TranscriptionJobDto, ProtocolGenerationJobDto, MeetingListItem, etc.
- shared/src/api/*.ts: per-UC request/response Zod schemas (see api-contract.md files)
- shared/src/index.ts barrel re-exports

## Verification

- Zod schemas round-trip parse on a sample object
- TS compilation succeeds (tsc --noEmit) in shared/

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
