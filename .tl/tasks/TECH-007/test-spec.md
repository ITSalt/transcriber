# TECH-007 — Test Spec

## Acceptance tests

- Round trip: putObject(stream) then getObjectStream returns identical bytes
- deleteObject removes the key; subsequent get throws NotFound
