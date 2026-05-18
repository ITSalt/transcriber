---
id: TECH-023
title: GitHub Actions deploy-production.yml + repo secrets
type: tech
wave: 9
priority: high
depends_on: ['TECH-018', 'TECH-019', 'TECH-022']
owner: dev
---

# TECH-023 — GitHub Actions deploy-production.yml + repo secrets

## What

Add a GitHub Actions workflow that, on push to `main` (after CI passes), SSHes into the PROD host as `deploy`, pulls the latest code, builds the monorepo, runs Prisma migrations, syncs the frontend, and `pm2 reload`s the apps. Pattern mirrors learn's `.github/workflows/deploy-production.yml` exactly, adapted for pnpm + the workspace layout.

## Deliverables

1. `.github/workflows/deploy-production.yml`:
   - Triggers on `push: branches: [main]`.
   - `concurrency: deploy-production / cancel-in-progress: false` — never abort a deploy mid-run.
   - Job `ci`: `uses: ./.github/workflows/ci.yml` (existing).
   - Job `deploy`: `needs: ci`, `environment: production`.
   - Step **Configure SSH** — writes `secrets.PRODUCTION_SSH_KEY` to `~/.ssh/deploy_key` (0600), runs `ssh-keyscan` of `secrets.PRODUCTION_HOST`.
   - Step **Deploy via SSH** — single heredoc script (see impl-brief) that runs as `deploy@<host>`.
   - Step **Health check** — `curl` `${vars.PRODUCTION_URL}/api/health` with 30×5s retry.
   - Step **Notify on failure** — `::error::` annotation + actionable rollback hint.
2. New GitHub repository secrets list (handed to user to paste):
   - `PRODUCTION_SSH_KEY` — private key (PEM) of an SSH key whose public part is in `/home/deploy/.ssh/authorized_keys` on PROD.
   - `PRODUCTION_HOST` — `82.202.156.157`.
   - `PRODUCTION_USER` — `deploy`.
3. New repository variable: `PRODUCTION_URL` = `https://transcriber.itsalt.ru`.
4. New "production" environment in GitHub UI with required reviewer (recommended: protect main from accidental redeploy).

## Out of scope

- Initial DNS A-record (TECH-024).
- Initial server bootstrap (TECH-017, TECH-018).
- Rotation policy for secrets — separate operational task post-MVP.

## Verification

1. `act` or a dry-run branch: push to a throwaway branch, manually dispatch the workflow against a test commit, observe deploy logs reach "Health check" step against a temporary URL — full happy path tested **before** TECH-024 cutover.
2. Read the workflow file with `actionlint` (CI lint, not blocking).

## Definition of done

- [ ] Workflow file committed.
- [ ] All required secrets/vars/environment are listed for the user to set in GitHub UI.
- [ ] `actionlint .github/workflows/deploy-production.yml` reports no errors (manual run).
- [ ] PR linked to this task.
