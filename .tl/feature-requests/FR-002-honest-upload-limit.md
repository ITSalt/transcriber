# Feature Request: FR-002 — Honest upload limit (1.5 GiB + 4h duration gate)

## Metadata

| Field | Value |
|-------|-------|
| Created | 2026-08-15 |
| Status | spec-complete |
| Source | `/nacl-sa-feature` — raise the upload cap and make it actually reachable |
| Impact method | Neo4j graph traversal + measured production evidence |
| Decision | `DEC-004` |

## Feature Description

Raise `MAX_UPLOAD_BYTES` from 1 GiB to **1.5 GiB**, add a **4-hour recording-duration
gate**, and land the pipeline fixes that make the advertised cap actually reachable.

## Why the requested 8 GB was not specified

The brief asked for 8 GB. Measurement said the pipeline could not honour even the
**1 GiB it already advertised**, so raising the constant alone would have converted an
honest client-side rejection into a mid-pipeline failure. Two implementation defects
bound the real ceiling to roughly **400–600 MB**; both are now fixed (shipped in
`53bd404` and part of this feature):

| Blocker | Detail |
|---|---|
| Deepgram SDK 60 s default timeout | Covered upload **and** processing. Prod's longest recording (4429 s) fit with seconds to spare. Fixed: pinned at 570 s. |
| Audio copied 3× in RAM | `Buffer.concat` → `Buffer.from` → undici `extractBody`, against a 1024M worker cap. One copy is gratuitous. |

Assumptions in the brief that measurement disproved:

- **"VPS disk can't hold 8 GB."** Storage is external S3 (`s3.cloud.ru`); uploaded
  bytes go browser → storage directly and never touch the API host's disk.
- **"Check nginx `client_max_body_size`."** The proxy is Caddy, already
  `request_body max_size 0`, and uploads bypass it entirely.
- **"Provider size limit binds."** Deepgram's 2 GB payload cap and 10-minute
  synchronous cap only bind near ~5 GB — an order of magnitude above the real ceiling.

**8 GB requires Deepgram's async callback mode** — a two-phase BullMQ pipeline, a
public callback endpoint, an `AWAITING_CALLBACK` migration and a dropped-callback
sweeper (~12–18 engineer-days), and it is gated on an unverified assumption that
Deepgram can fetch presigned URLs from `s3.cloud.ru` at usable throughput. That is a
redesign, not a limit change.

## Why 1.5 GiB + 4 h specifically

At the 4-hour gate, every constraint has headroom:

| Constraint | At 4 h | Margin |
|---|---|---|
| FLAC payload | **182 MB** (measured) | 9% of Deepgram's 2 GB cap |
| Peak worker RSS | **~594 MB** (measured) | under the 1024M pm2 cap — **no pm2 change needed** |
| ASR round-trip | **~47 s** (measured fit) | **12× under** the 570 s budget |
| Russian protocol context | **~50K tokens** (measured) | well under the 200K window |

Leaving `max_memory_restart` alone matters: the VPS is shared with four other
products on 7.8 GB of RAM.

**The duration gate carries the real constraint.** Bytes are a poor proxy — 1.5 GiB is
5.5 h at the 656 kbps observed in production but only 71 minutes at 1080p/3 Mbps.
`ffprobe` already runs at finalization and its `durationSec` was being **discarded**.

## Impact Summary

| Area | Change | Details |
|------|--------|---------|
| Architecture | no change | — |
| Domain | ~1 attribute | `Recording-A04` (size constraint); `Recording.duration_sec` must be persisted |
| Use Cases | ~1 modified | `UC-100` (spec_version 2 → 3) |
| Requirements | +1 new, ~4 modified | **new** `RQ-039`; modified `RQ-008`, `NFR-001`, `NFR-003`, `UC-100-AS04` |
| Business layer | ~5 modified | `BRQ-001`, `BR-102`, `BP-001`, `BP-001-S03`, `EXT-04` |
| Context/glossary | ~3 modified | `GLO-025`, `DFL-001`, `UC-100.user_story` |
| Roles | no change | — |
| UI: Forms | ~1 modified | `FORM-MeetingUpload-F02` label |
| UI: Components | no change | — |

### The graph contradicted itself before this feature

Ten nodes carried a size limit and **disagreed**: six still said 500 MB
(`NFR-001`, `BRQ-001`, `Recording-A04`, `BP-001`, `BP-001-S03`, `EXT-04`) while four
said 1 GiB (`RQ-008`, `BR-102`, `FORM-MeetingUpload-F02`, `UC-100-AS04`). The
`RQ-008` vs `NFR-001` contradiction pre-dated this feature; it is closed here.

## Modified UCs to Re-plan

- **UC-100** — byte cap 1 GiB → 1.5 GiB; new duration gate `RQ-039`; `AS04` validation
  step extended; file-field label updated.

## New TECH Tasks

None. The pipeline changes live inside the existing UC-100 / UC-200 task scope.

## Implementation notes for TL

Verified on prod before specifying: `ffmpeg 6.1.1` has both `flac` and `libopus`
encoders, so FLAC extraction has no infrastructure blocker.

| Change | Where |
|---|---|
| `MAX_UPLOAD_BYTES = 1_610_612_736` | `shared/src/api/uc100.ts:10` |
| Import shared constants instead of re-declaring | `web/src/routes/upload/index.tsx:17` (`MAX_SIZE_BYTES`, `ACCEPTED_MIME_TYPES`) — a logged debt item |
| Duration gate | `api/src/services/uc-100.service.ts` — `probeContainer` already runs and its `durationSec` is discarded |
| FLAC instead of `pcm_s16le` | `worker/src/lib/ffmpeg.ts:56-60` |
| Drop the gratuitous copy | `deepgram-adapter.ts` `toBuffer` — `Buffer.from` on an existing Buffer |
| `PRESIGN_EXPIRES_SEC` 3600 → 21600 | `api/src/routes/upload-init.ts:18` |
| Worker read-presign 1800 → 7200 | `worker/src/jobs/transcription.ts` |
| Per-part retry + `/abort` on failure | `web/src/routes/upload/index.tsx` — currently absent, so an aborted upload leaves **billable orphaned multipart parts** |
| i18n size strings | `web/src/i18n/{ru,en}.json` — incl. the dead `upload.supported` key still claiming "до 10 ГБ" and listing rejected audio MIME types |

Part size (10 MiB) and Cloud.ru limits (5 TB object, 10 000 parts, 5 GB per part) need
no change — 1.5 GiB is 154 parts.

## Verification — DONE 2026-08-16 (measured, not estimated)

Run on production hardware against a real 693 s recording, with no provider calls
and no writes to the production database.

- **FLAC is lossless — proved bitwise.** Decoding our FLAC back to raw PCM is
  byte-identical (`cmp`) to the `pcm_s16le` output, so the codec swap cannot move
  word-error rate. No Deepgram call was needed to establish this.
- **Compression:** 13.1 kB/s versus 32 kB/s for PCM — **59% smaller**, better than
  the 45% originally assumed. A 4 h recording is a **182 MB** payload.
- **Peak worker RSS: ~594 MB** against the 1024M pm2 cap (baseline 45 → chunks 230
  → concat 412 → undici body copy 594). The removed `Buffer.from` copy accounts for
  exactly 182 MB of headroom; with it the peak was 776 MB.
- **`-sample_fmt s16` proved essential, and was missing in the first
  implementation.** `pcm_s16le` pinned the bit depth implicitly; `flac` does not,
  and Opus sources decode to float, so ffmpeg silently emitted **24-bit** FLAC:
  a 355 MB payload and a measured **1113 MB peak RSS — over the pm2 cap**. That
  would have OOM-restarted the worker on every 4 h job, and the stall-recovery fix
  would then have re-run it, burning Deepgram spend each time. Fixed and pinned by
  a test.

- **Deepgram accepts the 16-bit FLAC container — verified 2026-08-17** by one
  authorised 30 s call through the real adapter. `metadata.duration` returned
  exactly 30 (container parsed, not guessed), language auto-detect returned `ru`,
  diarization and utterances produced 12 segments.

### Timing — RESOLVED 2026-08-17, the 4 h gate is comfortably servable

Measured at three durations rather than assumed. All three returned a correct
`metadata.duration`, so each container was genuinely parsed.

| audio | payload | round-trip | realtime |
|---|---|---|---|
| 30 s | 0.4 MB | 2.4 s | 12.5× |
| 693 s | 8.7 MB | 4.3 s | 161× |
| **7200 s (2 h)** | **89.8 MB** | **24.4 s** | **295×** |

Linear fit: **t = 2.16 s fixed + 3.09 ms per audio-second** (predicts 2.25 s at
30 s versus 2.4 s measured — consistent across two orders of magnitude).

- **4 h → ~47 s round-trip**, roughly **12× under** the 570 s client timeout.
- The timeout would not bind until **~51 h** of audio; Deepgram's own 600 s
  synchronous cap not until ~54 h.
- The earlier "12.5× realtime, may not be servable" alarm was an artefact of the
  30 s probe, where fixed per-request overhead dominates. It was raised as
  uncertain in both directions, and the uncertainty resolved favourably.
- **Protocol-generation input measured:** 62,410 chars at 2 h → ~125K chars /
  **~50K tokens** at 4 h, well inside the 200K context. The earlier ~132K-token
  figure was an over-estimate.

### Still open

- Full end-to-end at the ceiling — the one leg never exercised is **kie.ai
  protocol generation on a 4 h transcript**. Every other stage is now measured
  independently (extraction, memory, ASR round-trip, LLM input size).

## Decisions

- **DEC-004** — Upload cap raised to 1.5 GiB and bounded by a 4-hour duration gate.
  Rationale, alternatives and measured evidence live on the graph node; this list is a
  projection. `(:FeatureRequest {id:'FR-002'})-[:IMPLEMENTS]->(:Decision {id:'DEC-004'})`.

## Stale (to re-plan)

9 Tasks stamped `review_status='stale'`, `stale_origin='FR-002'` — `UC-100-BE/FE`
plus the transitive `DEPENDS_ON` downstream (`UC-200-BE`, `UC-201-BE/FE`, `UC-300-BE`,
`UC-301-BE/FE`, `UC-302-BE`). Run `/nacl-tl-plan --feature FR-002` to clear.

## Known validation findings (pre-existing, NOT introduced here)

- **L3.7b ×3** — `RQ-008`, `RQ-009`, `RQ-010` each carry **two** `REALIZED_BY` anchors:
  a correct one to `FORM-MeetingUpload-F02` plus an extra to `UC-100-AS04`, which trips
  the target-label check. Deliberately not "fixed": deleting a real traceability edge to
  satisfy a WARNING-level lint would lose information. `RQ-039` is anchored singly and
  correctly.

## Skills Invoked

- `/nacl-sa-feature` (this run) — impact analysis, graph writes, FR + Decision
- Next: `/nacl-tl-plan --feature FR-002`, then `/nacl-tl-dev-be` + `/nacl-tl-dev-fe`
