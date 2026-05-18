---
task: UC-300
phase: be
status: ready_for_review
commit: 0c11bf3
completed: 2026-05-18
test_run: pnpm test (vitest run)
---

# Result: UC-300 BE — Protocol Generation Worker Pipeline

## Implemented

BullMQ job handler `worker/src/jobs/protocol-generation.ts` orchestrates protocol generation: load transcript segments from DB, build a structured prompt from segments, call `ILlmProvider` (kie.ai / Claude Sonnet 4.6), parse the Markdown response, persist `ProtocolDto` to the Meeting record as JSONB, update `ProtocolGenerationJob` to `DONE`, and publish SSE events on each transition. Errors set job to `FAILED`.

## Files

- `worker/src/jobs/protocol-generation.ts`
- `worker/src/jobs/protocol-generation.test.ts`

## Tests

- Test file: `worker/src/jobs/protocol-generation.test.ts`
- Tests: 29 passed, 0 failed
- Notable cases: full pipeline happy path generates and persists protocol, LLM error sets job to FAILED, SSE events published on PROCESSING and DONE transitions

## TDD

RED -> GREEN -> REFACTOR pattern followed. Tests written before implementation.

## Notes

Follow-up commit `8e92405` fixed protocol field name alignment with the UC-301 schema rename (`content` field). No behavioral change — data shape correction only.
