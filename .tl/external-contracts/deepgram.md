# External Contract — `deepgram`

## 1. Identity

| Field | Value |
|---|---|
| **Name** | `deepgram` |
| **Kind** | `provider` |
| **Owner skill** | `nacl-sa-architect` |
| **Consumed by** | `nacl-tl-plan`, `nacl-tl-sync` (W2 wire-evidence), `nacl-tl-qa`, `nacl-tl-dev-be` |
| **Created** | `2026-05-22` |
| **Last updated** | `2026-05-22` |
| **References** | UC-200 (Process transcription pipeline), ADR-006, TECH-010, `worker/src/asr/deepgram-adapter.ts`, https://developers.deepgram.com/docs/pre-recorded-audio |

## 2. Endpoint

| Field | Value |
|---|---|
| **Base URL** | `https://api.deepgram.com/v1` (encapsulated by `@deepgram/sdk@5.2.0`) |
| **All endpoints** | `POST /v1/listen` — submit pre-recorded audio buffer for transcription with diarization. Returns synchronous JSON. |
| **Discovery** | `static-catalog` |
| **Versioning** | Path segment `/v1`; SDK pinned at `^5.2.0` |

## 3. Auth

| Field | Value |
|---|---|
| **Scheme** | `Token <key>` (Deepgram-specific Authorization header set by SDK) |
| **Secret env var** | `DEEPGRAM_API_KEY` |
| **Missing-secret behavior** | Adapter throws `DeepgramAsrError("Missing DEEPGRAM_API_KEY")` at provider init. `nacl-tl-qa` per Stage Decomposition Gate: COMPONENT_QA / LOCAL_RUNTIME_QA still run; WIRE_CONTRACT_QA / PROVIDER_FIXTURE_QA / LIVE_PROVIDER_SMOKE require the key. |
| **Rotation** | Manual via Deepgram dashboard; `.env` on prod server (`/opt/transcrib/.env`) is the canonical store; rotation owner = ops. |

## 4. Request shape

| Field | Value |
|---|---|
| **Content-Type** | `audio/*` (binary; MP3/WAV/M4A/FLAC — Deepgram detects) |
| **Required headers** | `Authorization: Token ${DEEPGRAM_API_KEY}` (SDK-managed) |
| **Body shape** | Raw audio buffer/stream. Query parameters carry options. |
| **Query params** | `language=ru|en|en-US|en-GB` OR `detect_language=true`; `diarize=true`; `punctuate=true`; `utterances=true`; `model=nova-3`; `smart_format=true` |

```jsonc
// Conceptual call shape (SDK abstracts the HTTP):
deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
  model: "nova-3",
  diarize: true,
  punctuate: true,
  utterances: true,
  language: "ru" | "en" | undefined,    // undefined → detect_language=true
  smart_format: true,
})
```

## 5. Response shape

| Field | Value |
|---|---|
| **Success status** | `200` |
| **Success body** | `ListenV1Response` per `@deepgram/sdk` types |
| **Parsing path** | `result.results.channels[0].alternatives[0].transcript` for raw text; `result.results.utterances[]` for `{speaker, transcript, start, end}` segments; speakers normalized to `Speaker 0..N`. |
| **Required response headers** | `Content-Type: application/json` |

```jsonc
// 200 OK (abridged)
{
  "results": {
    "channels": [
      { "alternatives": [{ "transcript": "...", "words": [...] }] }
    ],
    "utterances": [
      { "speaker": 0, "transcript": "...", "start": 1.23, "end": 4.56 }
    ]
  }
}
```

## 6. Lifecycle: sync vs async

| Field | Value |
|---|---|
| **Mode** | `sync` |
| **(If async) Submit endpoint** | N/A |
| **(If async) Poll endpoint** | N/A |
| **(If async) Poll cadence** | N/A |
| **(If async) Polling timeout** | N/A |
| **Cancellation** | SDK call uses AbortSignal; BullMQ job cancellation propagates via Job.token.abort. No explicit Deepgram cancel API. |

## 7. File-URL reachability assumptions

| Field | Value |
|---|---|
| **Scheme expected by consumers** | The audio buffer is uploaded inline (not via URL). N/A for browser. |
| **Reverse-proxy translation** | N/A — server→provider direct call. |
| **Public origin vs origin server** | N/A |
| **Lifetime** | N/A (inline body) |
| **Toolchain compatibility** | Audio buffer is extracted via ffmpeg from the source video; see `.tl/external-contracts/s3-multipart-presigned.md` § 7 (ffmpeg presigned URL requirement, postmortem C6 fix 5d9585d). |

## 8. Failure codes

| Code | Meaning | Consumer action |
|---|---|---|
| `401` | bad/missing API key | halt; surface `AUTH_FAILED`; BullMQ job → FAILED |
| `400` | bad audio format / unsupported parameters | halt; surface `CONTRACT_FAILED` with response body |
| `402` | quota exhausted | halt; surface `PROVIDER_QUOTA` |
| `429` | rate limit | retry with exponential backoff (BullMQ retry, max 3 attempts) |
| `5xx transient` | provider transient | retry per cadence; budget cap = 3 attempts then FAILED |
| `timeout` (>5 min on long audio) | local timeout | abort + retry once with shorter audio (chunked); else FAILED |

## 9. Model namespace / catalog

| Field | Value |
|---|---|
| **Catalog source** | `static-list-in-this-file` (Deepgram model catalog at https://developers.deepgram.com/docs/models-overview) |
| **Namespace prefix policy** | NONE — pass model id verbatim |
| **Models in use** | `nova-3` (default; supports RU + EN + diarization in one call) |

## 10. Fixture-test path

| Field | Value |
|---|---|
| **Fixture file** | `worker/test/fixtures/deepgram-nova3-utterances.json` (to be authored in W6) |
| **Test file** | `worker/test/wire/deepgram.fixture.test.ts` (to be authored in W6) |
| **What it asserts** | `parseDeepgramResult(recordedResponse)` produces `AsrResult{ segments: [...], rawText, speakerMap, language }` without mocking the parse layer. |
| **Run command** | `pnpm --filter @transcrib/worker run test -- deepgram` |

## 11. Smoke-test path

| Field | Value |
|---|---|
| **Smoke test file** | `worker/test/smoke/deepgram.smoke.test.ts` (to be authored in W6) |
| **Env vars required** | `DEEPGRAM_API_KEY` |
| **Sandbox vs prod** | Deepgram has no separate sandbox; smoke runs against prod API with a 5-second canonical audio sample committed under `worker/test/fixtures/sample-en-short.mp3`. |
| **Run command** | `DEEPGRAM_API_KEY=$DEEPGRAM_API_KEY pnpm --filter @transcrib/worker run smoke -- deepgram` |
| **Stage decomposition** | `LIVE_PROVIDER_SMOKE`, `PROVIDER_FIXTURE_QA`. PROD_GOLDEN_PATH for UC-200 is a separate run against transcriber.itsalt.ru per W7. |

## Optional fields

| Field | Value |
|---|---|
| **Webhook callback shape** | N/A — Deepgram synchronous API used; async callbacks not in scope |
| **Idempotency key header** | Deepgram does not require idempotency; BullMQ jobId is the local idempotency key |
| **Vendor SDK version pin** | `@deepgram/sdk@^5.2.0` (worker/package.json) |
| **Framework-specific gotchas** | `fluent-ffmpeg` chain feeds an audio-extracted buffer to Deepgram. Source video URL is a presigned S3 URL (post-5eb7e18). |
