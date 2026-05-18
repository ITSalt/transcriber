# TECH-024 — Implementation brief

This task is a **runbook**, not an implementation. Treat the task.md as the script you follow.

## Pre-cutover backup of Caddyfile

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.pre-transcrib-$(date +%Y%m%d-%H%M%S)
```

Why: `/etc/caddy/Caddyfile` is not under git. If the transcrib block has a subtle bug that `caddy validate` doesn't catch, the timestamped backup is the rollback target.

## Pre-cutover database snapshot (optional but recommended)

Even though the DB is fresh, take a `pg_dump` to have a "known-empty" state to restore to if migration order ever gets messy:

```bash
docker exec learn-postgres pg_dump -U postgres transcrib > /tmp/transcrib-empty-$(date +%Y%m%d).sql
```

## Smoke-test script (paste into result.md when done)

Save this to track exactly what was tested:

```bash
#!/usr/bin/env bash
set -e
URL=https://transcriber.itsalt.ru

echo "1. SPA root"
curl -sfI "$URL/" | head -3

echo "2. Health"
curl -sf "$URL/api/health"
echo

echo "3. Neighbour (learn)"
curl -sfI "https://learn.itsalt.ru/api/health" | head -1

echo "4. TLS cert issuer"
echo | openssl s_client -servername transcriber.itsalt.ru -connect transcriber.itsalt.ru:443 2>/dev/null | openssl x509 -noout -issuer

echo "5. Server resources (via SSH)"
ssh magz@82.202.156.157 'free -h && df -h / && uptime'
```

## End-to-end UC walkthrough

(Manual, browser-based — capture screenshots into `result.md`.)

1. **UC-001** — catalog page loads, shows empty state.
2. **UC-100** — upload a fixture video (the test/ folder has `small.mp4` from Wave 0 work). Watch TUS progress.
3. **UC-200** — worker auto-pipeline: confirm via SSE that "processing" → "transcribing" → "generating protocol" → "done".
4. **UC-002** — open the meeting detail page.
5. **UC-201** — view + download transcript.
6. **UC-301** — edit protocol text, save.
7. **UC-302** — export PDF; open downloaded file.
8. **UC-003** — delete the meeting. Verify object is gone from S3 (or just check the lifecycle rule will catch it within 3 days).

## Decommissioning the first session

After the cutover passes:

- Tag the deploy commit: `git tag -a v0.1.0-mvp -m "First production deploy"`.
- Push tag: `git push origin v0.1.0-mvp`.
- Add the SHA to `.tl/tasks/TECH-024/result.md`.

If the cutover fails irrecoverably and you need to abandon — DNS rollback is the only externally visible change:
- Remove the A-record (or repoint elsewhere).
- learn, Mattermost, and the server are unaffected; the transcrib app keeps running on `127.0.0.1:3010` but nobody reaches it.
