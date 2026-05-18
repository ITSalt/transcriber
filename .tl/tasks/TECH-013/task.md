---
id: TECH-013
title: Web scaffold (Vite + React 19 + shadcn + Tailwind + TanStack Query + Router + i18next)
type: tech
wave: 0
priority: high
depends_on: ['TECH-001', 'TECH-004']
---

# TECH-013 — Web scaffold (Vite + React 19 + shadcn + Tailwind + TanStack Query + Router + i18next)

## What

Bootstrap web/ with Vite 5, React 19, TypeScript, shadcn/ui, Tailwind CSS, TanStack Query v5, React Router 7, i18next (RU+EN).

## Deliverables

- web/vite.config.ts with React + TS
- web/src/main.tsx mounts <App/> with QueryClientProvider + RouterProvider + i18next provider
- web/src/routes/* shell (catalog, detail, upload, transcript, protocol) as empty stubs
- web/src/lib/api.ts: typed fetch wrapper consuming Zod schemas from shared/
- shadcn components installed: Button, Card, Dialog, Input, Select, Toast, Table, Progress, Badge, Textarea
- i18n keys for RU + EN at web/src/i18n/{ru,en}.json
- Tailwind configured with shadcn theme + design tokens

## Verification

- pnpm --filter web dev starts dev server
- pnpm --filter web build produces a valid bundle
- Visiting /catalog renders empty page without console errors

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification checks pass.
- [ ] Pull request links to this task file by ID.
- [ ] No follow-up TODOs left in the codebase that block downstream UCs.
