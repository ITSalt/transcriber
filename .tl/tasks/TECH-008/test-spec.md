# TECH-008 — Test Spec

## Acceptance tests

- TUS POST /api/uploads with valid Upload-Metadata returns 201 + Location
- Oversized file (>500 MB declared) rejected at pre-create with 413
- Wrong MIME rejected with 415
