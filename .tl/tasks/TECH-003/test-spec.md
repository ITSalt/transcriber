# TECH-003 — Test Spec

## Acceptance tests

- prisma migrate dev --create-only produces expected SQL
- prisma migrate deploy succeeds against dev Postgres
- Round-trip create+findFirst works for each entity (integration smoke)
