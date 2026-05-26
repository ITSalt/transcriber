# TECH-026 — Implementation Brief

> FeatureRequest FR-001. Domain attributes TranscriptionJob-A08, ProtocolGenerationJob-A09.

## Steps
1. Edit `prisma/schema.prisma`: add `attempt_count Int @default(0)` to `TranscriptionJob` and `ProtocolGenerationJob`.
2. `pnpm prisma migrate dev --name add_attempt_count` (or the project's migration workflow). Verify backfill default 0 on existing rows.
3. Update the corresponding Zod schemas in `shared/` (job DTOs) to include `attempt_count: z.number().int().nonnegative()`.
4. Regenerate Prisma client; confirm BE (`api/`, `worker/`) typecheck.

## Notes
- `@default(0)` makes the migration safe against existing rows.
- Downstream: UC-200-BE / UC-300-BE write `attempt_count` (mirror BullMQ attemptsMade); UC-004-BE resets to 0.
