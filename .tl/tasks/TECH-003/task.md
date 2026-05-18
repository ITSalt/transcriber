---
id: TECH-003
title: Prisma schema & migrations
type: tech
wave: 0
priority: high
depends_on: ['TECH-001', 'TECH-002']
---

# TECH-003 — Prisma schema & migrations

## What

Define Prisma schema for the SA-layer entities, with enums and FK relationships per the domain model. Apply initial migration against the dev Postgres.

## Deliverables

- prisma/schema.prisma in api/ with models: Meeting, Recording, TranscriptionJob, Transcript, ProtocolGenerationJob, Protocol
- Enums: MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType
- Cascade deletes per RQ-006: Meeting deletion cascades to Recording/Transcript/Protocol/Jobs
- Composite indexes on (meeting_id, status) for jobs
- JSONB for Transcript.speaker_map and any segments_blob
- Initial migration applied; prisma generate produces @prisma/client

## Verification

- prisma migrate dev --create-only produces expected SQL
- prisma migrate deploy succeeds against dev Postgres
- Round-trip create+findFirst works for each entity (integration smoke)

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
