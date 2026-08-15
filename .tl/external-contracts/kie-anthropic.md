# External Contract — `kie-anthropic`

## 1. Identity

| Field | Value |
|---|---|
| **Name** | `kie-anthropic` (kie.ai's Anthropic-compatible endpoint) |
| **Kind** | `provider` |
| **Owner skill** | `nacl-sa-architect` |
| **Consumed by** | `nacl-tl-plan`, `nacl-tl-sync` (W2), `nacl-tl-qa`, `nacl-tl-dev-be` |
| **Created** | `2026-05-22` |
| **Last updated** | `2026-08-13` (DEC-001 — §5 HTTP-200 error envelope + §8 failure-code rewrite; the previous `404 = MODEL_NOT_FOUND` row was factually wrong) |
| **References** | UC-300 (Generate protocol pipeline), ADR-007, TECH-011, `worker/src/llm/kieai.ts`, https://docs.kie.ai/market/claude/claude-sonnet-4-6.md |

## 2. Endpoint

| Field | Value |
|---|---|
| **Base URL** | `https://api.kie.ai/claude/v1` |
| **All endpoints** | `POST /claude/v1/messages` — Anthropic-shape LLM call (sync) |
| **Discovery** | `static-catalog` |
| **Versioning** | Path segment `/claude/v1`; pinned at v1 as of 2026-05-19 (post-1f025b7 switch from earlier `/generate` endpoint to Anthropic-shape). |

## 3. Auth

| Field | Value |
|---|---|
| **Scheme** | `Authorization: Bearer ${KIE_API_KEY}` (NOT `x-api-key` — kie.ai's Anthropic endpoint uses Bearer per worker/src/llm/kieai.ts) |
| **Secret env var** | `KIE_API_KEY` |
| **Missing-secret behavior** | Adapter throws at LlmProvider init. `nacl-tl-qa` Stage Decomposition: stages without key still run; WIRE/PROVIDER/LIVE_SMOKE stages require key (see GAP-019). |
| **Rotation** | Manual via kie.ai dashboard; `.env` on prod server stores; rotation owner = ops. |

## 4. Request shape

| Field | Value |
|---|---|
| **Content-Type** | `application/json` |
| **Required headers** | `Authorization: Bearer $KIE_API_KEY` |
| **Body shape** | Anthropic Messages API shape; system prompt + user message containing transcript text + prompt template. |
| **Query params** | none |

```jsonc
POST /claude/v1/messages
Content-Type: application/json
Authorization: Bearer $KIE_API_KEY

{
  "model": "claude-sonnet-4-6",
  "system": "<RU or EN protocol prompt from worker/dist/llm/prompts/{ru,en}/protocol.md>",
  "messages": [
    { "role": "user", "content": "<transcript raw text + speaker_map>" }
  ],
  "stream": false,
  "max_tokens": 4096
}
```

## 5. Response shape

| Field | Value |
|---|---|
| **Success status** | `200` |
| **Success body** | Anthropic Messages API response envelope |
| **Parsing path** | `response.content[0].text` for protocol markdown (NOT `response.choices[0].message.content` — that's OpenAI-shape) |
| **Required response headers** | `Content-Type: application/json` |

```jsonc
// 200 OK
{
  "id": "msg_01...",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-4-6",
  "content": [
    { "type": "text", "text": "# Протокол встречи\n\n..." }
  ],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 12345, "output_tokens": 1500 }
}
```

### 5.1 Error variant delivered INSIDE HTTP 200 — the gateway envelope

**`HTTP 200` does NOT imply success on kie.ai.** kie.ai fronts the model with a
gateway that reports at least some provider/gateway errors with a `200` status
line and an error envelope in the body:

```jsonc
// HTTP 200 — but this is an ERROR
{ "code": 401,
  "msg": "Unauthorized – Authentication failed. Please check that your Authorization and Content-Type headers are correctly set." }
```

Observed empirically on `2026-08-13` (`POST /claude/v1/messages` with an invalid
Bearer key → `HTTP 200` + the body above). The envelope carries no `content`
array, so a consumer that only reads `content[]` sees an "empty completion" and
loses both the real cause and the correct retry decision.

**Consumer rule — classify on the EFFECTIVE status, never on the HTTP status alone:**

```
effective_status = (http_status === 200
                    && body is an object
                    && typeof body.code === 'number'
                    && body.code !== 200)
                 ? body.code
                 : http_status
```

Then apply §8 to `effective_status`. A success response is an Anthropic envelope
with a `content` array and **no** top-level numeric `code` — the two shapes are
unambiguous.

There is also a third, documented-but-not-observed shape: the vendor OpenAPI for
`/claude/v1/messages` declares `400` / `401` responses in Anthropic passthrough
form `{"error":{"message":…,"type":…}}` with a real HTTP status. That shape is
already covered by §8 via the HTTP status, and needs no special parsing.

## 6. Lifecycle: sync vs async

| Field | Value |
|---|---|
| **Mode** | `sync` |
| **(If async) Submit endpoint** | N/A |
| **Cancellation** | AbortSignal via SDK fetch; BullMQ job lock propagates abort. |

## 7. File-URL reachability assumptions

`N/A — no file URLs. The transcript text + prompt template are inline in request body.`

## 8. Failure codes

Codes below are **effective statuses** per §5.1 — a code delivered inside an
`HTTP 200` `{code,msg}` envelope is classified by exactly the same table as the
same code delivered as a real HTTP status. Revised `2026-08-13` by `DEC-001`.

| Effective code | Meaning | Class | Consumer action |
|---|---|---|---|
| `400` | malformed Anthropic envelope (missing `messages` / wrong roles / OpenAI-shape leaked through) | **permanent** | halt; surface `CONTRACT_FAILED` |
| `401` | bad/missing Bearer token | **permanent** | halt; surface `AUTH_FAILED` |
| `402` | quota exhausted | **permanent** | halt; surface `PROVIDER_QUOTA` |
| `404` | **gateway did not route the path.** NOT "model not found" — the model id travels in the request *body*, never in the URL, so a bad model id can never produce a 404 (it reaches the handler and returns an envelope error instead). kie.ai answers an unrouted path with a Spring Boot whitelabel body `{timestamp,status,error,message,path}`. | **transient** | retry with backoff per BullMQ retry policy; FAILED only after exhaustion |
| `408` | request timeout | **transient** | retry with backoff |
| `413` | request too large (input_tokens > model context) | **permanent** | halt; truncate transcript or chunk (a bare retry cannot help) |
| `429` | rate limit | **transient** | retry with backoff per BullMQ retry policy |
| `5xx` | provider/gateway transient | **transient** | retry per cadence; max 3 attempts then FAILED |
| any other `4xx` | unlisted client-class error | **permanent** (default) | halt; surface the raw code + `msg`/body |
| network / transport failure (DNS, connection reset, socket timeout — no HTTP response at all) | the request never completed | **transient** | retry with backoff |
| local parse failure — body is not JSON, or is JSON with neither a usable `content[]` nor a numeric `code` | our own contract assumption broke | **permanent** | halt; surface the raw body (truncated) so the shape drift is diagnosable |

**Why `404` is transient (reversal, `2026-08-13`).** This row previously read
`404 | model not found | halt; surface MODEL_NOT_FOUND`, which was factually
wrong: the model is sent in the body (`worker/src/llm/kieai.ts`), so a 404 cannot
carry model semantics. Live probes on `2026-08-13` confirm kie.ai returns `404`
for unrouted paths only, and the `2026-05-26` incident recorded the same request
returning `200` twelve minutes later — a gateway routing blip. A genuinely
permanent 404 (a misconfigured base URL, as in `1f025b7`) still terminates in
FAILED once the 3 attempts are exhausted, so the reversal costs at most 2 extra
attempts + ~15s of backoff and buys survival of every routing blip.

> **Scope (F-004 closed 2026-08-15).** This retry policy takes effect on every
> path. Both the automatic path (`worker/src/jobs/transcription.ts` →
> `createQueues()`) and the API-enqueued paths (UC-100 upload, UC-004
> manual-retry) construct their Queues with
> `defaultJobOptions: JOB_RETRY_OPTIONS` from `@transcrib/shared`, so all jobs
> carry `attempts=3` + exponential backoff. Verified by reading the persisted
> `job.opts` back out of Redis after a live enqueue.

## 9. Model namespace / catalog

| Field | Value |
|---|---|
| **Catalog source** | `static-list-in-this-file` (kie.ai catalog at https://docs.kie.ai/market/claude/) |
| **Namespace prefix policy** | NONE — pass model id verbatim. NO `anthropic/` prefix, NO `claude-3-*` legacy ids — kie.ai uses Anthropic's own naming but with their `claude-sonnet-4-6` slug. |
| **Models in use** | `claude-sonnet-4-6` (default), `gpt-5.4` (declared in ADR-007 but NOT wired — different endpoint family; adapter throws typed error on this model id) |

## 10. Fixture-test path

| Field | Value |
|---|---|
| **Fixture file** | `worker/test/fixtures/kie-anthropic-claude-response.json` (to be authored in W6) |
| **Test file** | `worker/test/wire/kie-anthropic.fixture.test.ts` (W6) |
| **What it asserts** | `parseKieAiResponse(recordedAnthropicResponse).markdown === recordedResponse.content[0].text` without mocking the parse layer. |
| **Run command** | `pnpm --filter @transcrib/worker run test -- kieai` |

## 11. Smoke-test path

| Field | Value |
|---|---|
| **Smoke test file** | `worker/test/smoke/kie-anthropic.smoke.test.ts` (W6) |
| **Env vars required** | `KIE_API_KEY` |
| **Sandbox vs prod** | kie.ai has no separate sandbox; smoke runs against prod with a minimal 50-token transcript fixture. |
| **Run command** | `KIE_API_KEY=$KIE_API_KEY pnpm --filter @transcrib/worker run smoke -- kieai` |
| **Stage decomposition** | `LIVE_PROVIDER_SMOKE`, `PROVIDER_FIXTURE_QA`. PROD_GOLDEN_PATH for UC-300 = separate run against transcriber.itsalt.ru per W7. |

## Optional fields

| Field | Value |
|---|---|
| **Webhook callback shape** | N/A — sync API |
| **Vendor SDK version pin** | None — uses Node 22 built-in fetch (no SDK dependency per worker/src/llm/kieai.ts) |
| **Framework-specific gotchas** | Prompt templates live at `worker/src/llm/prompts/{ru,en}/protocol.md`; worker build script copies these to `dist/llm/prompts/` (fix 66049d5). Missing prompts → worker ENOENT at runtime. Tracked as runtime asset in config.yaml (W8). RU prompt was rewritten with structured XML role/constraints (40341a6); shape change documented in worker code. |
