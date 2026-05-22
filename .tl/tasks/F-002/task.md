# F-002 — Recapture provider wire-evidence fixtures from real responses

**Type:** follow-up (post-W11 GAP-closure)
**Status:** open
**Created:** 2026-05-22
**Owner:** backend lead

## Source

W11 pilot replay
([`.tl/gap-closure/2026-05-22-pilot-replay.json`](../../gap-closure/2026-05-22-pilot-replay.json))
`post_w11_followups_not_in_this_run[1]`:

> "Recapture worker/test/fixtures/{deepgram,kie-anthropic}.json from real
> provider responses at the next opportunity (currently synthesized from
> contract spec; W7 verified the live shape matches)"

Additionally extends to the other three W6 fixtures, all currently
synthesized rather than recorded:

## Deliverable

Replace the synthesized fixture content in each of the following with
fixtures captured from a real provider/protocol response. Preserve filename
and shape; update the `_meta.captured_at` and remove the "synthesized" note.

| Fixture | Source for real capture |
|---|---|
| `worker/test/fixtures/deepgram-nova3-utterances.json` | Run `worker/test/smoke/deepgram.smoke.test.ts` once F-003 lands; capture the response body verbatim. Alternatively re-run the W7 PROD_GOLDEN_PATH leg manually and intercept the worker's Deepgram response. |
| `worker/test/fixtures/kie-anthropic-claude-response.json` | Same as above for kie.ai `/claude/v1/messages`. Use a real transcript sample (not just "say READY") so the protocol markdown is representative. |
| `api/test/fixtures/s3-multipart-init-response.json` | Capture from a real `POST /api/uploads/init` call against the prod MinIO/Cloud.ru endpoint. The W7 evidence file `.tl/tasks/UC-100/qa-evidence/2026-05-22-prod-golden-path.yaml` contains the relevant response payload — extract and reformat. |
| `shared/test/fixtures/sse-event-frames.json` | Already canonical (frame format pinned by `api/src/sse/sse-formatter.ts` per fix 7f983f6). Lower priority. |
| `api/test/fixtures/protocol-sample.md` | Replace with the actual markdown the prod UC-300 pipeline generated during W7 (`.tl/tasks/UC-300/qa-evidence/...`). |

## Deadline

Open. This is technical debt with **provider-API-change lifetime** — fixtures
go stale whenever Deepgram changes Nova-3's response envelope or kie.ai
revises its Anthropic-compat layer. Recommend recapturing as part of any
subsequent provider-related fix or release.

## Acceptance criteria

- Each fixture's `_meta.captured_at` reflects an actual capture timestamp
  (not "synthesized from contract spec").
- The corresponding `worker/test/wire/*.fixture.test.ts` / `api/test/wire/*.fixture.test.ts` tests still pass (the canonical shape assertions should hold against real responses).
- `.tl/external-contracts/<slug>.md § 10` (Fixture-test path) needs no
  schema change — only the content under the fixture path changes.

## References

- `.tl/external-contracts/{deepgram,kie-anthropic,s3-multipart-presigned,sse,puppeteer-pdf}.md`
- Fixtures created in W6 (commit `748e4cf`)
- Pilot replay note in `.tl/gap-closure/2026-05-22-pilot-replay.json`
