# Project-memory Neo4j — operations (ADR-013)

Separate Neo4j 5 Community instance for the project-memory graph. It is **not**
the dev spec-graph container `transcrib-neo4j` (ports 3614/3627).

## Service

`docker-compose.yml` → `memory-neo4j`:

- ports only on `127.0.0.1`: bolt `7688`, browser `7475`
- auth: `neo4j` / `MEMORY_NEO4J_PASSWORD` (dev default `memory_dev_password`; set a real one in prod)
- limits (D-16): heap 512m/512m, page cache 256m, transaction cap 256m,
  `-XX:+ExitOnOutOfMemoryError`, container `mem_limit: 1536m`, `restart: unless-stopped`
- volume `memory_neo4j_data`

```bash
docker compose up -d memory-neo4j
docker compose ps memory-neo4j                       # healthy
docker inspect -f '{{.HostConfig.Memory}}' "$(docker compose ps -q memory-neo4j)"   # 1610612736
```

Env for the app: `MEMORY_NEO4J_URI` (`bolt://localhost:7688`), `MEMORY_NEO4J_USER`,
`MEMORY_NEO4J_PASSWORD`, `MEMORY_NEO4J_DATABASE` (see `.env.example`).

### Password — set it BEFORE the first start

`NEO4J_AUTH` is applied only on the first start against an empty volume. Put
`MEMORY_NEO4J_PASSWORD` into `/opt/transcrib/.env` **before** the first
`docker compose up -d memory-neo4j`. If the first start happens without it, the
database is created with the dev default `memory_dev_password` and changing the
env later does not change the password (it would need `ALTER USER` or a fresh
volume).

### Which `.env` is read by what

| Reader | File |
|--------|------|
| `docker compose` (substitutes `MEMORY_NEO4J_PASSWORD` into `NEO4J_AUTH`) | `/opt/transcrib/.env` (compose project directory) |
| prod deploy step (`deploy-production.yml`, reads only `MEMORY_NEO4J_*`, never executes the file) | `/opt/transcrib/.env` |
| worker at runtime and `graph:migrate` (pm2 `cwd=/opt/transcrib/worker`, `env_file: '.env'`, dotenv) | `/opt/transcrib/worker/.env` |

The `MEMORY_NEO4J_*` values must match in both files. Deploy: if
`MEMORY_NEO4J_URI` is missing from `/opt/transcrib/.env` the `graph:migrate`
step is skipped with a warning; if the migration fails the deploy continues and
logs `::error::graph:migrate failed - run it manually`.

## Backup

Community cannot dump online, so `scripts/neo4j-backup.sh` stops the container
for the duration of the dump (seconds for a small graph), writes a gzip copy and
restarts it (also on failure). It aborts if free space in `BACKUP_DIR` is below
2× the data directory size, and keeps the newest 3 copies (`BACKUP_KEEP`),
because prod `/` has little free space (D-16).

```bash
BACKUP_DIR=/var/backups/transcrib-neo4j scripts/neo4j-backup.sh
```

Cron (daily, 03:30; run from the compose project directory so
`docker compose ps` resolves the container, or set `NEO4J_CONTAINER`):

```cron
30 3 * * * cd /opt/transcrib && BACKUP_DIR=/var/backups/transcrib-neo4j scripts/neo4j-backup.sh >> /var/log/transcrib-neo4j-backup.log 2>&1
```

## Restore

Destructive: replaces the database contents.

```bash
scripts/neo4j-restore.sh /var/backups/transcrib-neo4j/neo4j-<timestamp>.dump.gz
```

Then check: `docker compose ps memory-neo4j` is healthy and
`cypher-shell ... 'MATCH (n) RETURN count(n)'` matches expectations.
