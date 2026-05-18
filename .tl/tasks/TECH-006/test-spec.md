# TECH-006 — Test Spec

## Acceptance tests

- enqueue('transcriptionJob', {...}) -> worker receives, runs handler (echo handler at this stage)
- Worker handler throwing sets job to failed in Bull
