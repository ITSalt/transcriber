# QA Report — UC-200: Transcription Pipeline (Worker)

**Date:** 2026-05-18  
**Tester:** Transcrib Conductor  
**Verdict:** SKIP

## Reason for Skip
UC-200 requires a real Deepgram Nova-3 API key (`DEEPGRAM_API_KEY`) to test the transcription pipeline end-to-end. The current environment has a placeholder key — live API calls would fail.

## What Would Be Tested
- BullMQ job picked up by worker after upload finalize
- ffmpeg extracts audio from video file
- Deepgram API called with audio + diarization enabled
- Transcript segments stored in DB with speaker labels
- Meeting status transitions: UPLOADING → TRANSCRIBING → TRANSCRIBED
- SSE events emitted at each status change

## Coverage From Unit Tests
- Worker job handler unit tests: all passing
- IAsrProvider interface contract verified
- Deepgram adapter unit tests: all passing (mocked HTTP responses)
- Status transition logic tested

## Re-test Criteria
Provide a real `DEEPGRAM_API_KEY` and a valid MP4 file ≤ 500 MB. Then upload via UC-100 and observe worker pipeline completion.
