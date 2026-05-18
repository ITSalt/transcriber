# TECH-005 — Test Spec

## Acceptance tests

- GET /health returns 200 with all probes green
- Throwing AppError('VALIDATION_FAILED', 400, ...) yields JSON error body
- Invalid request body (zod fail) yields 400 with field-level details
