---
id: TECH-010
title: IAsrProvider + Deepgram Nova-3 adapter
type: tech
wave: 0
priority: high
depends_on: ['TECH-006']
---

# TECH-010 — IAsrProvider + Deepgram Nova-3 adapter

## What

Define IAsrProvider abstraction (ADR-006) in shared/. Implement DeepgramAsrProvider against Deepgram Nova-3 with diarization + RU/EN.

## Deliverables

- shared/src/asr/IAsrProvider.ts: transcribe({audio, languageHint?}) -> AsrResult{segments[], detectedLanguage, speakers[]}
- worker/src/asr/deepgram.ts implements provider via @deepgram/sdk
- Provider reads DEEPGRAM_API_KEY from env
- Detects language when languageHint is null per BRQ-005

## Verification

- transcribe on a sample EN audio fixture returns segments with speaker labels and non-empty text
- languageHint=null sets detectedLanguage on result

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
