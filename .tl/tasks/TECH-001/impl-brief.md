# TECH-001 — Implementation Brief

## Step plan

1. Initialize root package.json with pnpm workspace + scripts.
2. Create pnpm-workspace.yaml with package globs.
3. Add tsconfig.base.json + per-package tsconfig.json with project refs.
4. Configure eslint (typescript-eslint), prettier, vitest at root.
5. Add .editorconfig, .nvmrc (Node 20).
6. Verify pnpm install + pnpm typecheck pass.
