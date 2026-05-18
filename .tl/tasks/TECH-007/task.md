---
id: TECH-007
title: S3/MinIO storage adapter
type: tech
wave: 0
priority: high
depends_on: ['TECH-005']
---

# TECH-007 — S3/MinIO storage adapter

## What

Implement IStorage abstraction with putObject/getObjectStream/deleteObject. Adapter targets MinIO in dev, drop-in compatible with AWS S3/R2 via env (per ADR-004).

## Deliverables

- shared/src/storage/IStorage.ts contract
- api/src/storage/s3-adapter.ts (uses @aws-sdk/client-s3 against S3_ENDPOINT)
- All references use the s3://bucket/key URI shape (ADR-004)
- putObject supports multipart streaming for large uploads

## Verification

- Round trip: putObject(stream) then getObjectStream returns identical bytes
- deleteObject removes the key; subsequent get throws NotFound

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
