---
task: TECH-011
type: review
mode: tech
status: approved
reviewed: 2026-05-18
commit: 4ef599c
---

# Review: TECH-011 — ILlmProvider + kie.ai Adapter

Workflow status: `REVIEW COMPLETE`. Code judgment: `APPROVED`. Action required: address result.md drift (non-blocking).

## Stub Gate

PASSED. No TODO/FIXME/STUB/MOCK/HACK markers in shared interface, adapter, or prompts.

## Files Reviewed

- `shared/src/llm/ILlmProvider.ts` (70 lines)
- `shared/src/llm/index.ts` (re-export)
- `worker/src/llm/kieai.ts` (162 lines)
- `worker/src/llm/kieai.test.ts` (312 lines)
- `worker/src/llm/prompts/en/protocol.md`
- `worker/src/llm/prompts/ru/protocol.md`

## Acceptance Verification

| Criterion | Result | Notes |
|-----------|--------|-------|
| ILlmProvider abstraction in `shared/` (ADR-007) | PASS | `generate(input: LlmInput) → Promise<LlmResult>` |
| Implementation supports claude-sonnet-4-6 (default) | PASS | `LLM_MODEL_DEFAULT` exported; tested |
| Implementation supports gpt-5-4 selectable per call | PASS | `opts.model='gpt-5-4'` routes to `gpt-5.4` alias on kie.ai |
| Reads KIE_API_KEY from env | PASS | Constructor falls back to process.env, throws KieAiLlmError otherwise |
| Prompt templates in `worker/src/llm/prompts/{ru,en}/protocol.md` (BRQ-013) | PASS | Both present; RU and EN templates contain the four BRQ-011 sections |
| Returns LlmResult{text, model, tokensIn, tokensOut} | PASS | Token counts read from `data.usage.prompt_tokens`/`completion_tokens` |

## Checklist Findings (8-Category BE)

| Category | Result | Notes |
|----------|--------|-------|
| 1. Code Correctness | PASS | Correct fetch handling, JSON parse guards, empty-content rejection |
| 2. Code Quality | PASS | Named constants (`KIE_API_BASE_URL`, `MODEL_ALIAS`), small focused methods, no `any` |
| 3. Error Handling | PASS | `KieAiLlmError` carries `status` + `reason`; differentiates network vs HTTP vs JSON parse vs empty content |
| 4. Testing | PASS | 19 tests cover constructor, default/override model routing, auth header, system+user messages, RU/EN prompts, token plumbing, missing-usage default, HTTP 401/429, network errors, empty choices, empty content, custom baseUrl |
| 5. Security | PASS | API key only sent in Authorization header (never logged or echoed in error messages); user-controlled `model` value is constrained by `LlmModel` union |
| 6. Performance | PASS | No retries or backoff (see note below); single fetch per call. Acceptable for MVP — the BullMQ job layer handles retry semantics |
| 7. Documentation | PASS | Module + interface JSDoc references ADR-007 and BRQ-013 |
| 8. Git & Commits | PASS | Single atomic commit `4ef599c` |

## Issues

### MAJOR

- **MAJOR (result.md drift)** — `result.md` claims:
  - Interface signature `complete(messages, opts)` returning a string → ACTUAL: `generate(input: LlmInput) → Promise<LlmResult>`.
  - "retries on 429 rate-limit" → ACTUAL: code throws `KieAiLlmError` on any non-ok HTTP status. No retry/backoff loop exists in `kieai.ts`.
  - "strips markdown fences from response" → ACTUAL: no fence-stripping logic; the response content is returned verbatim.
  - File listed as `shared/src/llm/types.ts` → ACTUAL: `shared/src/llm/ILlmProvider.ts`.
  - File listed as `worker/src/llm/index.ts` → does not exist.

  The actual code is internally consistent and tested; the **result document misrepresents it**. This will mislead downstream UC-300-BE devs reading result.md. Recommend `/nacl-tl-docs TECH-011` to correct the narrative.

### MINOR

- **MINOR (kieai.ts:43)** — `MODEL_ALIAS` maps `'gpt-5-4' → 'gpt-5.4'`. The on-wire alias is undocumented in any ADR; if kie.ai later changes its model identifier, this needs updating. Worth a comment pointing to kie.ai docs.
- **MINOR (kieai.ts:117)** — fetch has no explicit timeout. A hanging kie.ai endpoint will block the worker job indefinitely. Consider an AbortController-based timeout. Non-blocking because BullMQ stalled-job recovery will eventually move on, but a deliberate timeout is cleaner.
- **MINOR** — Prompt templates are loaded via `readFileSync` on every call. For a worker process that may handle many jobs this is a small inefficiency. Could be cached at module load.

## Test Results

- Test file: `worker/src/llm/kieai.test.ts`
- Tests: 19/19 passed (per result.md; corroborated by 441/441 workspace total).
- Notable assertions: default model = claude-sonnet-4-6; model alias mapping; Authorization Bearer header; system+user message structure; RU prompt picks Russian template; token plumbing; error class with HTTP status.

## TDD Compliance

Single atomic commit `4ef599c`. RED/GREEN/REFACTOR not separated in git history. Standard for TECH-class work.

## Test Author Independence

| File | Author |
|------|--------|
| kieai.ts | noreply@anthropic.com |
| kieai.test.ts | noreply@anthropic.com |

Overlap: 100%. Single-commit TECH task — non-blocking, recorded.

## Positive Observations

- PRAISE: Clean separation of `LlmModel` union from on-wire `MODEL_ALIAS`. The shared layer exposes stable identifiers; the adapter translates.
- PRAISE: Strong error class — `KieAiLlmError` distinguishes network / HTTP / parse / empty-content failure modes, all with `reason` payload for diagnostics.
- PRAISE: Empty-content check (`content.trim().length === 0`) catches a real failure mode where kie.ai responds 200 but with nothing useful.
- PRAISE: RU and EN prompt templates closely mirror each other (same 4-section structure, same response-format directive), making i18n maintenance easier.

## Verdict

**APPROVED** — Code is solid and tested. The headline issue is documentation drift in result.md, which should be patched before UC-300-BE consumes it. The actual implementation conforms to the task spec and BRQ-013/ADR-007.

## Next Steps

- `/nacl-tl-docs TECH-011` to align result.md with the actual interface (`generate` not `complete`, no retries, no fence stripping, correct file paths), THEN
- `/nacl-tl-next` to proceed.
