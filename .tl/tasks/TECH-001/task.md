---
id: TECH-001
title: Monorepo & tooling
type: tech
wave: 0
priority: high
depends_on: []
---

# TECH-001 — Monorepo & tooling

## What

Bootstrap pnpm workspace with packages: api/, worker/, web/, shared/. Configure root tsconfig (project references), eslint, prettier, vitest, and a Makefile / npm scripts for common dev tasks.

## Deliverables

- pnpm-workspace.yaml lists api/, worker/, web/, shared/
- package.json scripts: dev, build, test, lint, typecheck
- Root tsconfig.base.json with strict mode + path aliases for @transcrib/shared
- ESLint flat config + Prettier config shared across packages
- Vitest root config that aggregates package-level test runs

## Verification

- pnpm install resolves without errors
- pnpm typecheck passes (empty packages)
- pnpm lint passes (no source yet)

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
