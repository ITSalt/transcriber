# TECH-023 — Implementation brief

## Why separate secrets from learn's `PRODUCTION_*`?

Both projects deploy as the same `deploy` user on the same host. We **could** reuse `PRODUCTION_SSH_KEY` etc., but:
- Rotation of one project shouldn't force re-rotation of the other.
- A misconfigured workflow in one repo can't accidentally use the other's deploy lane.
- Two repos with different visibility settings deserve isolated secret scopes.

Pragmatically: the SSH key value will be **the same** PEM as learn's (one key on `deploy`'s authorized_keys); we just store a copy under a project-namespaced name.

## Workflow skeleton

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  ci:
    name: CI Checks
    uses: ./.github/workflows/ci.yml

  deploy:
    name: Deploy to Production Server
    runs-on: ubuntu-latest
    needs: ci
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Configure SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.PRODUCTION_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H ${{ secrets.PRODUCTION_HOST }} >> ~/.ssh/known_hosts 2>/dev/null

      - name: Deploy via SSH
        env:
          SSH_KEY: /home/runner/.ssh/deploy_key
          SSH_USER: ${{ secrets.PRODUCTION_USER }}
          SSH_HOST: ${{ secrets.PRODUCTION_HOST }}
        run: |
          ssh -i $SSH_KEY ${SSH_USER}@${SSH_HOST} << 'DEPLOY'
            set -euo pipefail
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
            nvm use 20

            cd /opt/transcrib
            git fetch --all --prune
            git checkout main
            git reset --hard origin/main   # preserves untracked .env, api/.env symlink, etc.

            # Install + build (workspace-wide).
            pnpm install --frozen-lockfile
            pnpm --filter @transcrib/shared run build      # ts project refs first
            pnpm --filter @transcrib/api run build
            pnpm --filter @transcrib/worker run build
            pnpm --filter @transcrib/web run build

            # DB migrate
            pnpm --filter @transcrib/api run db:migrate:deploy

            # Sync static frontend to /var/www/transcrib/frontend/dist
            rsync -a --delete web/dist/ /var/www/transcrib/frontend/dist/

            # pm2 reload (zero-downtime). Start if first deploy.
            cd /opt/transcrib
            pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
            pm2 save
          DEPLOY

      - name: Health check
        env:
          PROD_URL: ${{ vars.PRODUCTION_URL }}
        run: |
          for i in $(seq 1 30); do
            code=$(curl -s -o /dev/null -w '%{http_code}' "${PROD_URL}/api/health" || true)
            if [ "$code" = "200" ]; then
              echo "Production healthy."
              exit 0
            fi
            echo "Attempt $i/30: HTTP $code — retrying in 5s..."
            sleep 5
          done
          echo "::error::Production health check failed."
          exit 1

      - name: Notify on failure
        if: failure()
        run: |
          echo "::error::Deploy failed for commit ${{ github.sha }}. To roll back:"
          echo "  ssh deploy@${{ secrets.PRODUCTION_HOST }}"
          echo "  cd /opt/transcrib && git reset --hard <previous-sha> && pnpm install --frozen-lockfile && pnpm -r build && pm2 reload ecosystem.config.cjs"
```

## Notes

- `pnpm install --frozen-lockfile` — fails if `pnpm-lock.yaml` is out of sync; same guarantee as learn's `npm ci`.
- `git reset --hard origin/main` is intentional — eliminates drift from prior failed deploys. **Untracked** files (`.env`, symlinks, logs) are preserved.
- Build order: `shared` first (TS project ref output), then api/worker/web in parallel — but we serialize them in the script for predictable log order. Optimization is post-MVP.
- `pnpm --filter @transcrib/api run db:migrate:deploy` — this script must exist in `api/package.json` (likely already does from TECH-003). Confirm before merging.
- `pm2 reload` is zero-downtime; `pm2 save` persists the process list across reboots (learn's pm2 startup unit is already in place under `deploy`).
- `environment: production` lets you require a manual approval in GitHub UI before any deploy fires — recommended once a real user is on the system. For the first deploys it can be unprotected.

## GitHub UI checklist for the user

1. Settings → Secrets and variables → Actions → New repository secret:
   - `PRODUCTION_SSH_KEY` — paste the same private key used for learn (PEM block), or generate a new pair and add its `.pub` to `/home/deploy/.ssh/authorized_keys` (recommended for stronger isolation, but additive — keeps learn's key untouched).
   - `PRODUCTION_HOST` — `82.202.156.157`.
   - `PRODUCTION_USER` — `deploy`.
2. Variables tab → New repository variable:
   - `PRODUCTION_URL` — `https://transcriber.itsalt.ru`.
3. Settings → Environments → New environment:
   - Name: `production`.
   - (Optional) Required reviewers: yourself.

## Operational note — secrets MUST be at environment level, not repo level

Learn's pattern (and what we adopted): all `PRODUCTION_*` secrets live under the `production` **environment**, not under repo-level Actions secrets. The workflow's `deploy` job has `environment: production`, which exposes environment-scoped secrets to that job. Repo-level secrets ARE available too, but environment secrets give you the audit/approval guardrail (`Required reviewers`) and the ability to scope rotation per environment.

## Lesson from first deploy attempt (rotation)

The first deploy attempt failed with `Permission denied (publickey)` because the SSH key value pasted into `PRODUCTION_SSH_KEY` did not match any public key under `deploy@server`'s `~/.ssh/authorized_keys`. Recovery procedure used:

1. Generate fresh ed25519 keypair on operator workstation:
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-transcrib-deploy" -f /tmp/transcrib_deploy_key -N ""
   ```
2. Append the new public key to deploy's authorized_keys (via `sudo -u deploy tee -a`).
3. Live-test: `ssh -i /tmp/transcrib_deploy_key deploy@server 'whoami'` returns `deploy`.
4. Pipe the private key to `gh secret set ... < /tmp/transcrib_deploy_key` (the value never appears in the shell, chat, or any log).
5. Delete the local keypair: `rm /tmp/transcrib_deploy_key*`.
6. Re-run the failed workflow: `gh run rerun <id> --failed`.

This is the canonical recovery sequence if `PRODUCTION_SSH_KEY` ever drifts or is rotated.
