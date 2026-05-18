# TECH-023 — Result

## Deliverables

- `.github/workflows/deploy-production.yml` — created
- `.github/workflows/ci.yml` — added `workflow_call:` trigger (see deviation note)

## Script verification

All required build and migration scripts confirmed present before writing the workflow:

| Package | Script | Status |
|---------|--------|--------|
| `@transcrib/shared` | `build` | present (`tsc --build`) |
| `@transcrib/api` | `build` | present (`tsc --build` + copy template.html) |
| `@transcrib/api` | `db:migrate:deploy` | present (`prisma migrate deploy`) |
| `@transcrib/worker` | `build` | present (`tsc --build`) |
| `@transcrib/web` | `build` | present (`tsc --noEmit && vite build`) |

No `api/package.json` changes were needed.

## Deviation from impl-brief

`ci.yml` required a one-line addition (`workflow_call:` trigger) to make it callable as a reusable workflow via `uses: ./.github/workflows/ci.yml`. Without this trigger GitHub Actions raises a validation error and the job is skipped entirely. The addition is purely additive — it does not alter existing CI behavior on `push` or `pull_request` events, adds no new inputs/outputs, and introduces no new jobs or steps.

## GitHub UI setup checklist

These must be configured by the user in the GitHub repository before the first deploy will succeed.

### Repository secrets
Navigate to: Settings → Secrets and variables → Actions → Secrets tab → New repository secret

| Secret name | Value |
|-------------|-------|
| `PRODUCTION_SSH_KEY` | Private key (PEM block, including `-----BEGIN ... PRIVATE KEY-----` header/footer) whose public key is in `/home/deploy/.ssh/authorized_keys` on the server. You can reuse the same key material as the `learn` project — just paste the same PEM under this new name. |
| `PRODUCTION_HOST` | `82.202.156.157` |
| `PRODUCTION_USER` | `deploy` |

### Repository variable
Navigate to: Settings → Secrets and variables → Actions → Variables tab → New repository variable

| Variable name | Value |
|---------------|-------|
| `PRODUCTION_URL` | `https://transcriber.itsalt.ru` |

### Environment
Navigate to: Settings → Environments → New environment

- Name: `production`
- Required reviewers: optional for early deploys; recommended to add yourself once real users are on the system.

## Workflow summary

```
push to main
  └─ job: ci   (runs full CI via .github/workflows/ci.yml reusable call)
  └─ job: deploy  (needs: ci, environment: production)
       1. Configure SSH (write deploy_key, ssh-keyscan known_hosts)
       2. Deploy via SSH heredoc:
            nvm use 20
            git fetch/checkout/reset --hard origin/main
            pnpm install --frozen-lockfile
            build: shared → api → worker → web
            prisma migrate deploy
            rsync web/dist/ → /var/www/transcrib/frontend/dist/
            pm2 reload ecosystem.config.cjs --update-env || pm2 start
            pm2 save
       3. Health check: curl /api/health × 30 attempts × 5s = max 2.5 min
       4. Notify on failure (if: failure()) — prints rollback command
```

## Concurrency

`group: deploy-production` + `cancel-in-progress: false` — a second push to `main` while a deploy is running will queue (not cancel) the in-flight deploy. This prevents torn deploys.
