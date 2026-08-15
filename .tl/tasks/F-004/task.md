# F-004 — API-side BullMQ producer enqueues with `attempts=1`, so no retry policy applies

**Type:** follow-up (spun out of `/nacl-tl-fix` DEC-001, 2026-08-13)
**Status:** closed (2026-08-15)
**Created:** 2026-08-13
**Owner:** backend lead
**Related:** `DEC-001`, `RC-UC-200`, `RC-UC-300`, `RC-UC-004`, `UC-004`, `UC-100`, FR-001

## Source

Found during the Phase-A gap-check for the kie.ai transience fix (`DEC-001`).
Deliberately excluded from that fix's code scope (`worker/src/llm/kieai.ts` only),
recorded here so the gap is not silently carried.

## Problem

`worker/src/queues.ts::createQueues()` sets the FR-001 retry policy:

```ts
new Queue(name, { connection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } } })
```

`api/src/queue.ts` does **not** — both helpers build a bare
`new Queue(NAME, { connection })`, so every job the API enqueues carries the
BullMQ default `attempts: 1`. BullMQ resolves job options from the *producing*
Queue instance, so the worker's `defaultJobOptions` never apply to those jobs.

Affected producer call sites:

| Call site | Queue | Effective attempts | Consequence |
|---|---|---|---|
| `api/src/services/uc-100.service.ts:204` → `addTranscriptionJob` | `transcriptionJob` | **1** | UC-100 upload: RC-UC-200 retry-with-backoff is inert on the primary transcription path |
| `api/src/services/uc-004.service.ts:196` → `addTranscriptionJob` | `transcriptionJob` | **1** | UC-004 manual retry of the transcription stage: single-shot |
| `api/src/services/uc-004.service.ts:198` → `enqueueProtocolGenerationJob` | `protocolGenerationJob` | **1** | UC-004 manual retry of the protocol stage: single-shot; `DEC-001` has no effect here |
| `worker/src/jobs/transcription.ts:302` → `createQueues()` | `protocolGenerationJob` | 3 + backoff | ✅ correct — the automatic post-transcription path |

So the FR-001 / v0.3.0 retry resilience is live only on the automatic
transcription → protocol hand-off. The upload-triggered transcription job and
both UC-004 manual-retry jobs still fail on the first transient error.

## Deliverable

1. Make the API producer share one canonical job-options source with the worker
   (extract `PROTOCOL_JOB_OPTIONS` / `TRANSCRIPTION_JOB_OPTIONS` into `shared/`,
   or set `defaultJobOptions` identically in `api/src/queue.ts`). Duplicated
   literals in two packages are what let this drift in the first place.
2. Regression test asserting the enqueued job's `opts.attempts === 3` and the
   exponential backoff for every producer call site.
3. Remove the `APPLICABILITY` caveat from `RC-UC-300.retry_semantics`, the
   `KNOWN GAP` sentence from `RC-UC-004.retry_semantics`, and the scope caveat
   from `.tl/external-contracts/kie-anthropic.md` §8 once closed.

## Verification

Enqueue a job through each producer and read back `job.opts.attempts` from Redis
(or assert on the mocked `Queue.add` options). Exit code alone is not evidence.
