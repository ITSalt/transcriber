# QA Report — UC-300: Protocol Generation (Worker)

**Date:** 2026-05-18  
**Tester:** Transcrib Conductor  
**Verdict:** SKIP

## Reason for Skip
UC-300 requires a real kie.ai API key (`KIE_API_KEY`) to test protocol generation end-to-end. The current environment has a placeholder key — live LLM API calls would fail.

## What Would Be Tested
- BullMQ job picked up after UC-200 transcription completes
- LLM provider called with transcript + meeting context
- Structured Markdown protocol generated and stored in DB
- Meeting status transitions: TRANSCRIBED → GENERATING_PROTOCOL → PROTOCOL_READY
- SSE events emitted at each status change
- Protocol version set to 1

## Coverage From Unit Tests
- Worker job handler unit tests: all passing
- ILlmProvider interface contract verified
- kie.ai adapter unit tests: all passing (mocked HTTP responses)
- Status transition logic tested

## Re-test Criteria
Provide a real `KIE_API_KEY` and complete the UC-200 pipeline first. Observe worker picks up the protocol generation job and meeting transitions to PROTOCOL_READY.
