# TECH-003 — Implementation Brief

## Step plan

1. Translate ENTITIES + ENUMS to Prisma schema (see acceptance.md for column list).
2. Add @relation cascade deletes per RQ-006.
3. Generate initial migration; review SQL.
4. Apply migration; verify schema.
5. Write a 1-line integration smoke test per entity.
