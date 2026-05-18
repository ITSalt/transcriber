---
id: TECH-012
title: SSE event stream
type: tech
wave: 0
priority: high
depends_on: ['TECH-005']
---

# TECH-012 — SSE event stream

## What

Implement GET /api/meetings/:id/events as a Server-Sent Events stream that emits Meeting.status transitions and current job progress (per ADR-010). Used by UC-001 catalog auto-refresh and UC-100/200/300 progress views.

## Deliverables

- api/src/routes/events.ts: SSE handler via Fastify reply.raw stream
- Pub/sub backed by Redis (worker -> publish, API -> subscribe) so transitions propagate across processes
- Event payload: {type:'meeting.status', meeting_id, status, error_reason?}
- Heartbeat ping every 15s
- Disconnect cleanup

## Verification

- SSE connection receives a status event when worker updates Meeting.status
- Stream sends heartbeat pings at the configured interval

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
