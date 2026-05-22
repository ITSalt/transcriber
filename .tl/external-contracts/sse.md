# External Contract — `sse`

## 1. Identity

| Field | Value |
|---|---|
| **Name** | `sse` |
| **Kind** | `protocol` |
| **Owner skill** | `nacl-sa-architect` |
| **Consumed by** | `nacl-tl-plan`, `nacl-tl-sync` (W2), `nacl-tl-dev-be`, `nacl-tl-dev-fe` |
| **Created** | `2026-05-22` |
| **Last updated** | `2026-05-22` (covers post-7f983f6 `event:<type>` framing fix) |
| **References** | TECH-012, ADR-010, UC-002 (meeting status), UC-003 (meeting deleted), UC-200 (transcription progress), UC-300 (protocol generation progress); `api/src/plugins/sse.ts`, `api/src/sse/{pubsub,sse-formatter}.ts`, `api/src/routes/events.ts`, `shared/src/api/sse-events.ts` |

## 2. Endpoint

| Field | Value |
|---|---|
| **Base URL** | `https://transcriber.itsalt.ru/api/meetings/:id/events` |
| **All endpoints** | `GET /api/meetings/:id/events` — Server-Sent Events stream for a single meeting. Heartbeat ping every 30s. |
| **Discovery** | `static-catalog` |
| **Versioning** | Unversioned; event union pinned via `SseEvent = z.discriminatedUnion('type', ...)` in `shared/src/api/sse-events.ts`. |

## 3. Auth

| Field | Value |
|---|---|
| **Scheme** | `none` (current MVP — single-tenant author role per SystemContext) |
| **Secret env var** | N/A |
| **Missing-secret behavior** | N/A |
| **Rotation** | N/A |

## 4. Request shape

| Field | Value |
|---|---|
| **Content-Type** | N/A (GET request) |
| **Required headers** | `Accept: text/event-stream` (set by browser EventSource); `Cache-Control: no-cache` recommended |
| **Body shape** | N/A |
| **Query params** | none |

## 5. Response shape

| Field | Value |
|---|---|
| **Success status** | `200` |
| **Success body** | `text/event-stream` continuous stream with `event:<type>\ndata:<json>\n\n` frames. **CRITICAL**: the `event:<type>` line MUST precede `data:` — without it, browser EventSource fires `'message'` listeners instead of typed listeners (postmortem fix 7f983f6). |
| **Parsing path** | Browser: `eventSource.addEventListener('<type>', (e) => JSON.parse(e.data))` for each `type` in `SseEvent` discriminated union. |
| **Required response headers** | `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` (Caddy passes through; needed if any intermediate proxy buffers). |

```
event: meeting.status
data: {"type":"meeting.status","meeting_id":"<uuid>","status":"TRANSCRIBING"}

event: meeting.deleted
data: {"type":"meeting.deleted","meeting_id":"<uuid>"}

event: ping
data: {"type":"ping"}
```

## 6. Lifecycle: sync vs async

| Field | Value |
|---|---|
| **Mode** | `async` (long-lived stream) |
| **(If async) Submit endpoint** | `GET /api/meetings/:id/events` (this is also the stream) |
| **(If async) Poll endpoint** | N/A — push-based; no client polling |
| **(If async) Poll cadence** | Server emits `ping` heartbeat every 30s |
| **(If async) Polling timeout** | None server-side; browser EventSource auto-reconnects on network drop |
| **Cancellation** | Browser closes EventSource; server detects via `request.raw.on('close')` and unsubscribes from Redis channel `meeting:<id>`. |

## 7. File-URL reachability assumptions

| Field | Value |
|---|---|
| **Scheme expected by consumers** | Browser uses `https://` to transcriber.itsalt.ru (HTTPS required for EventSource on prod). |
| **Reverse-proxy translation** | Caddy MUST NOT buffer the response. `X-Accel-Buffering: no` set by server; Caddy passes through. |
| **Public origin vs origin server** | EventSource opens against the public origin only. |
| **Lifetime** | Stream open until browser closes OR server shutdown. |
| **Toolchain compatibility** | N/A |

## 8. Failure codes

| Code | Meaning | Consumer action |
|---|---|---|
| `404` | meeting_id not found | EventSource fires `error`; browser stops retry |
| `5xx` | server error during stream open | EventSource auto-retries with backoff |
| `proxy buffering` | Caddy/nginx buffered the stream; events arrive in bursts | server must set `X-Accel-Buffering: no` (already in api/src/plugins/sse.ts) |
| `connection drop` | network blip | EventSource auto-reconnects; server resubscribes via Redis pub/sub `meeting:<id>` channel |

## 9. Model namespace / catalog

`N/A — protocol only.`

## 10. Fixture-test path

| Field | Value |
|---|---|
| **Fixture file** | `shared/test/fixtures/sse-event-frames.txt` (recorded raw event-stream output) (W6) |
| **Test file** | `api/test/wire/sse.fixture.test.ts` (W6) |
| **What it asserts** | `sseFormatter.format({type:'meeting.status', ...})` produces a frame that, when parsed by an EventSource-compatible parser, hits the correct typed listener. Discriminated-union parse via `SseEvent.parse(JSON.parse(frame.data))` succeeds for each fixture frame. |
| **Run command** | `pnpm --filter @transcrib/api run test -- sse` |

## 11. Smoke-test path

| Field | Value |
|---|---|
| **Smoke test file** | `api/test/smoke/sse.smoke.test.ts` (W6) |
| **Env vars required** | none (uses dev stack) |
| **Sandbox vs prod** | Local dev (docker-compose) for unit; transcriber.itsalt.ru for prod golden-path SSE leg of W7. |
| **Run command** | `pnpm --filter @transcrib/api run smoke -- sse` |
| **Stage decomposition** | `WIRE_CONTRACT_QA` (frame format), `LOCAL_RUNTIME_QA` (pub/sub end-to-end). |

## Optional fields

| Field | Value |
|---|---|
| **Stream / SSE frame envelope** | `event: <type>\ndata: <json>\n\n` — the `event:` line is MANDATORY per 7f983f6 fix. Default `'message'` event-name behavior is a project-beta postmortem class. |
| **Heartbeat policy** | Server emits `event: ping\ndata: {"type":"ping"}\n\n` every 30 seconds; browser EventSource treats as live signal. |
| **Reconnection** | Browser EventSource auto-reconnects. Server has no `Last-Event-ID` resume — current state is read from DB on reconnect (Meeting.status, etc.). |
| **Framework-specific gotchas** | (i) Fastify response stream — DO NOT use `reply.send()`; write directly to `reply.raw` with proper headers. (ii) Redis pub/sub channel pattern: `meeting:<id>`. (iii) Worker publishes via `redis.publish('meeting:<id>', JSON.stringify(event))`. (iv) Multiple browsers subscribed to same meeting share the Redis subscription. |
