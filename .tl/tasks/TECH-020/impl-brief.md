# TECH-020 — Implementation brief

## Caddyfile block (append to `/etc/caddy/Caddyfile`)

```caddyfile
# ITSalt Transcrib — Cloud.ru / Moscow
transcriber.itsalt.ru {
    encode gzip zstd

    log {
        output file /var/log/caddy/transcrib-access.log {
            roll_size 100mb
            roll_keep 14
        }
        format json
    }

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }

    # SSE — disable buffering so events flush immediately.
    @sse path_regexp sse ^/api/meetings/[^/]+/events$
    handle @sse {
        reverse_proxy 127.0.0.1:3010 {
            flush_interval -1
        }
    }

    # TUS uploads — large bodies, no buffering.
    # Caddy has no default request body limit, but we set request_body explicitly
    # to make the intent obvious to future readers.
    handle /api/uploads/* {
        reverse_proxy 127.0.0.1:3010
        request_body {
            max_size 0          # 0 = unlimited
        }
    }

    # Catch-all API.
    handle /api/* {
        reverse_proxy 127.0.0.1:3010
    }

    # Static SPA.
    handle {
        root * /var/www/transcrib/frontend/dist
        try_files {path} /index.html
        file_server

        @static path /assets/*
        header @static Cache-Control "public, max-age=31536000, immutable"

        @html path *.html /
        header @html Cache-Control "no-cache, no-store, must-revalidate"
    }
}
```

## Why `path_regexp` for SSE?

`handle /api/meetings/*/events` would match anything under `/api/meetings/.../events` — but Caddy's directive matcher uses path-prefix semantics. The regex matcher pins it to the exact pattern `/api/meetings/<id>/events` with no trailing segments, avoiding accidental capture of e.g. `/api/meetings/X/events/something`.

## Why `request_body { max_size 0 }` for TUS?

TUS (`@tus/server`) sends arbitrary-sized PATCH bodies for large videos (potentially gigabytes). Caddy's default is "no limit" but it's safer to be explicit — and the directive serves as documentation. The actual upper bound on object size in S3 is enforced by `@tus/server` config and by Cloud.ru bucket policy, not at the proxy.

## Pre-reload setup (required — TECH-020 result lesson)

Before reload, **pre-create the access log file** with caddy ownership:

```bash
sudo touch /var/log/caddy/transcrib-access.log
sudo chown caddy:caddy /var/log/caddy/transcrib-access.log
sudo chmod 0640 /var/log/caddy/transcrib-access.log
```

Caddy's worker runs as `caddy` and cannot create new files in `/var/log/caddy/` without help — `systemctl reload caddy` hangs on `permission denied` if you skip this. Then it timeouts and the new config is silently rejected.

## Reload procedure (zero-downtime)

```bash
sudo caddy validate --config /etc/caddy/Caddyfile     # exits 0 on syntactic + semantic OK
sudo systemctl reload caddy                            # SIGUSR1 — config swap, no connection drop
```

If reload hangs (rare — caused by the log-file issue above), use `sudo systemctl reset-failed caddy` followed by `sudo systemctl restart caddy`. Restart is fast (~50ms downtime, learn's SSE clients reconnect transparently). **Validate** first; never restart on an invalid config.

## Certificate provisioning

Caddy ACME is automatic. Once `transcriber.itsalt.ru` resolves to this host:
1. First request triggers HTTP-01 challenge over port 80 (already open in UFW).
2. Caddy stores cert in `/var/lib/caddy/.local/share/caddy/certificates/`.
3. Renewal is automatic (~30 days before expiry).

If DNS hasn't propagated yet, requests will fail with TLS handshake errors — but no other site is affected. **TECH-024 explicitly orders DNS before reload**, then waits up to 5 minutes for ACME.
