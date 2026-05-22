# External Contract — `kie-anthropic`

## 1. Identity

| Field | Value |
|---|---|
| **Name** | `kie-anthropic` (kie.ai's Anthropic-compatible endpoint) |
| **Kind** | `provider` |
| **Owner skill** | `nacl-sa-architect` |
| **Consumed by** | `nacl-tl-plan`, `nacl-tl-sync` (W2), `nacl-tl-qa`, `nacl-tl-dev-be` |
| **Created** | `2026-05-22` |
| **Last updated** | `2026-05-22` (covers post-1f025b7 endpoint switch) |
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

## 6. Lifecycle: sync vs async

| Field | Value |
|---|---|
| **Mode** | `sync` |
| **(If async) Submit endpoint** | N/A |
| **Cancellation** | AbortSignal via SDK fetch; BullMQ job lock propagates abort. |

## 7. File-URL reachability assumptions

`N/A — no file URLs. The transcript text + prompt template are inline in request body.`

## 8. Failure codes

| Code | Meaning | Consumer action |
|---|---|---|
| `401` | bad/missing Bearer token | halt; surface `AUTH_FAILED` |
| `404` | model not found (e.g. wrong model id like `claude-3-5-sonnet-20241022` not on kie.ai's catalog) | halt; surface `MODEL_NOT_FOUND` |
| `400` | malformed Anthropic envelope (missing `messages` / wrong roles / OpenAI-shape leaked through) | halt; surface `CONTRACT_FAILED` — this is the Project-Beta UC-300 404 postmortem class |
| `402` | quota exhausted | halt; surface `PROVIDER_QUOTA` |
| `413` | request too large (input_tokens > model context) | halt; truncate transcript or chunk and retry |
| `429` | rate limit | retry with backoff per BullMQ retry policy |
| `5xx transient` | provider transient | retry per cadence; max 3 attempts then FAILED |

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
