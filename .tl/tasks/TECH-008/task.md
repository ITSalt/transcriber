---
id: TECH-008
title: TUS upload protocol wiring
type: tech
wave: 0
priority: high
depends_on: ['TECH-005', 'TECH-007']
---

# TECH-008 — TUS upload protocol wiring

## What

Wire @tus/server on the Fastify API. Configured to stream chunks straight to S3 storage (TECH-007). Client-side helper in web/ uses tus-js-client.

## Deliverables

- api/src/plugins/tus.ts: mount @tus/server at /api/uploads with S3 datastore
- Upload metadata captured: filename, size_bytes, mime_type, meeting_id (passed via TUS Upload-Metadata header)
- Pre-create hook validates BRQ-001 (500 MB) + BRQ-002 (MIME) BEFORE accepting bytes
- On upload-finish hook fires a callback to UC-100-BE service (creates Meeting/Recording/TranscriptionJob)

## Verification

- TUS POST /api/uploads with valid Upload-Metadata returns 201 + Location
- Oversized file (>500 MB declared) rejected at pre-create with 413
- Wrong MIME rejected with 415

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
