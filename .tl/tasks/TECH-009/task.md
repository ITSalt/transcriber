---
id: TECH-009
title: ffmpeg audio extraction utility
type: tech
wave: 0
priority: high
depends_on: ['TECH-006']
---

# TECH-009 — ffmpeg audio extraction utility

## What

Provide an extractAudio(inputStream) -> AudioStream + durationSec helper in worker/. Uses fluent-ffmpeg; probes container integrity (BRQ-003) and reads duration.

## Deliverables

- worker/src/lib/ffmpeg.ts: extractAudio + probeContainer
- Outputs 16 kHz mono PCM/WAV stream suitable for Deepgram input
- probeContainer returns {durationSec, isValid} from ffprobe metadata

## Verification

- extractAudio on a known-good sample MP4 yields a non-empty stream + positive duration
- probeContainer on a corrupted file returns {isValid: false}

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
