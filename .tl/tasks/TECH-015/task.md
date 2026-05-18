---
id: TECH-015
title: GitHub Actions CI
type: tech
wave: 0
priority: high
depends_on: ['TECH-001']
---

# TECH-015 — GitHub Actions CI

## What

Author CI workflow: install -> lint -> typecheck -> test -> build for all packages on PR/push.

## Deliverables

- .github/workflows/ci.yml with matrix per package (api, worker, web, shared)
- Cache pnpm store + node_modules
- Postgres + Redis service containers for integration tests
- Job names mapped to required checks (visible on PRs)

## Verification

- PR opened triggers ci.yml
- All jobs complete green on the initial commit

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
