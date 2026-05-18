---
id: TECH-011
title: ILlmProvider + kie.ai adapter
type: tech
wave: 0
priority: high
depends_on: ['TECH-006']
---

# TECH-011 — ILlmProvider + kie.ai adapter

## What

Define ILlmProvider abstraction (ADR-007) in shared/. Implement KieAiLlmProvider supporting Claude Sonnet 4.6 (default) and GPT-5.4 selectable per meeting.

## Deliverables

- shared/src/llm/ILlmProvider.ts: generate({prompt, model?, language}) -> LlmResult{text, model, tokensIn, tokensOut}
- worker/src/llm/kieai.ts implements provider via kie.ai HTTP API
- Provider reads KIE_API_KEY from env
- Model defaults to 'claude-sonnet-4-6'; per-call override accepted
- Prompt templates in worker/src/llm/prompts/{ru,en}/protocol.md (RU + EN per BRQ-013)

## Verification

- generate({prompt:'test', language:'EN'}) returns non-empty text
- Switching model='gpt-5-4' routes to GPT endpoint

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
