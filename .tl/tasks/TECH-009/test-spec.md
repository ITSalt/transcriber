# TECH-009 — Test Spec

## Acceptance tests

- extractAudio on a known-good sample MP4 yields a non-empty stream + positive duration
- probeContainer on a corrupted file returns {isValid: false}
