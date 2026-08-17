# F-005 — Deepgram ASR branch carries the same narrow transience formula as the pre-DEC-001 LLM branch

**Type:** follow-up (spun out of `/nacl-tl-fix` DEC-001, 2026-08-13)
**Status:** open (deliverable 3 landed 2026-08-15; deliverables 1-2 still require live probes)
**Created:** 2026-08-13
**Owner:** backend lead
**Related:** `DEC-001`, `RC-UC-200`, `RQ-015`, `UC-200`, `worker/src/asr/deepgram-adapter.ts`

## Source

Found during the Phase-A gap-check for the kie.ai transience fix (`DEC-001`).
Explicitly out of scope there — `RQ-015` and `RC-UC-200` were **not** modified by
`DEC-001`, and no ASR code was touched.

## Problem

`worker/src/asr/deepgram-adapter.ts` classifies transience with the same
`429 || >= 500` formula that `DEC-001` has now rejected for the LLM branch:

> `isTransient` = true → 429 / 5xx: retriable with BullMQ backoff (RC-UC-200 FR-001)
> `isTransient` = false → 401/400/402/413 or local errors: permanent, write FAILED immediately.

Two questions are open and require **empirical probes against Deepgram** before
any spec change — the `DEC-001` conclusion must NOT be copied across by analogy:

1. Does Deepgram ever return `404` for a transient routing/availability reason,
   or is a Deepgram `404` genuinely permanent (unknown model/endpoint)? Deepgram
   puts the model in a **query parameter**, not the body, so unlike kie.ai a 404
   there may legitimately mean "unknown model" — the `DEC-001` rationale does not
   transfer.
2. Does Deepgram ever deliver an error inside an HTTP 200 envelope? (kie.ai does;
   there is no evidence Deepgram does.)

Additionally, `408` and network/transport failures are currently classified
permanent on the ASR branch, as they were on the LLM branch before `DEC-001`.
Those two are transient under any provider, independent of questions 1–2.

## Deliverable

1. Live probes against `api.deepgram.com` recording the status/body for: invalid
   key, unknown model, unrouted path, oversized payload.
2. Based on the evidence, a spec decision (`DEC-00N`) updating `RC-UC-200` +
   `RQ-015` + `.tl/external-contracts/deepgram-*.md` §8, then the code change.
3. At minimum — and independent of the probes — reclassify `408` and
   network/transport failures as transient on the ASR branch.

## Progress — 2026-08-15

**Deliverable 3 is DONE** (the probe-independent minimum):

- `transcribe()` now has a try/catch. Before this, `new DeepgramAsrError` was
  constructed exactly once in production code — for a missing API key — so a
  429 or a 5xx propagated as a raw SDK error, `isTransientAsrError` returned
  false for it, and the whole RQ-015 / RC-UC-200 FR-001 retry policy was **dead
  code** on the ASR branch. That was strictly worse than the narrow formula this
  task was filed about.
- `isTransientAsrStatus()` classifies **408 / 429 / 5xx** as transient; 400 /
  401 / 402 / 413 and other 4xx stay permanent.
- The request-timeout abort (`DeepgramTimeoutError` / `AbortError`) and
  transport failures with no HTTP response (`ECONNRESET`, `ECONNREFUSED`,
  `ETIMEDOUT`, `EAI_AGAIN`, undici's `TypeError('fetch failed')`, …) are
  transient. This matters more since the request timeout was pinned at 570 s:
  an over-long recording now aborts, and that abort must be retriable rather
  than bricking the meeting.
- Errors are matched **structurally**, not via `instanceof DeepgramError` — the
  SDK's error classes are not a stable surface, and binding to them would force
  every test that mocks `@deepgram/sdk` to re-export them.
- Tests: `deepgram-adapter.test.ts` → `error classification (F-005,
  probe-independent half)`, 10 cases. Mutation proof executed: with the adapter
  stashed the suite goes 10 failed / 11 passed; restored, 21 passed.

**Live probe run 2026-08-17 (30 s of real audio, authorised):** Deepgram
**accepts our 16-bit FLAC container**. `metadata.duration` came back exactly 30
(so the container was parsed, not guessed), language auto-detection returned `ru`,
and diarization + utterances produced 12 segments. This closes the "does the
provider accept the DEC-004 codec" question, but answers neither of the two
questions below — those need error-path probes, not a happy-path one.

**Deliverables 1-2 remain OPEN.** `404` is still classified **permanent**, and
there is still no handling of an error inside an HTTP 200 envelope. Both need
the live probes below; a regression test (`404 stays PERMANENT pending live
probes`) pins the current verdict so that flipping it is a deliberate act
accompanied by evidence and a decision record.

## Non-goal

Do **not** blanket-apply the kie.ai effective-status rule to Deepgram without
probe evidence. Copying a provider-specific conclusion across providers is the
error class that produced the original wrong `404 = MODEL_NOT_FOUND` row.
