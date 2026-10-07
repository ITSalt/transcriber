#!/usr/bin/env bash
# Backup of the project-memory Neo4j (ADR-013, WP-INFRA-01).
# Neo4j Community cannot dump online: the container is stopped briefly, the
# database is dumped with neo4j-admin from a throwaway container sharing the
# data volume, then the container is started again (also on failure).
#
# Env (all optional):
#   NEO4J_CONTAINER  container name/id   (default: resolved via `docker compose ps -q memory-neo4j`)
#   NEO4J_DATABASE   database to dump    (default: neo4j)
#   BACKUP_DIR       target directory    (default: ./backups/neo4j)
#   BACKUP_KEEP      copies to keep      (default: 3, D-16: prod disk is tight)
set -euo pipefail

DB="${NEO4J_DATABASE:-neo4j}"
BACKUP_DIR="${BACKUP_DIR:-./backups/neo4j}"
KEEP="${BACKUP_KEEP:-3}"
CONTAINER="${NEO4J_CONTAINER:-$(docker compose ps -aq memory-neo4j 2>/dev/null || true)}"

[ -n "$CONTAINER" ] || { echo "ERROR: memory-neo4j container not found (set NEO4J_CONTAINER)" >&2; exit 1; }
# NEO4J_CONTAINER is taken blindly otherwise; the prod docker daemon hosts foreign Neo4j containers.
svc="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' "$CONTAINER")"
[ "$svc" = "memory-neo4j" ] || { echo "ERROR: $CONTAINER is not the memory-neo4j compose service (label: '${svc}')" >&2; exit 1; }
case "$KEEP" in ''|*[!0-9]*|0) echo "ERROR: BACKUP_KEEP must be a positive integer" >&2; exit 1 ;; esac

IMAGE="$(docker inspect -f '{{.Config.Image}}' "$CONTAINER")"
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"

# Free-space guard: need at least 2x the data directory size.
data_kb="$(docker run --rm --volumes-from "$CONTAINER" --entrypoint du "$IMAGE" -sk /data | cut -f1)"
free_kb="$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
if [ "$free_kb" -lt $((data_kb * 2)) ]; then
  echo "ERROR: not enough free space in $BACKUP_DIR: ${free_kb} KB free, need >= $((data_kb * 2)) KB (2x data dir ${data_kb} KB)" >&2
  exit 1
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
TMP="$(mktemp -d "$BACKUP_DIR/.dump-XXXXXX")"
chmod 777 "$TMP" # neo4j-admin runs as the neo4j user inside the container
OUT="$BACKUP_DIR/${DB}-${TS}.dump.gz"

restart() { docker start "$CONTAINER" >/dev/null || echo "WARN: failed to restart $CONTAINER" >&2; }
cleanup() { rm -rf "$TMP"; rm -f "$OUT.partial"; }
trap 'restart; cleanup' EXIT

echo "Stopping $CONTAINER ..."
docker stop "$CONTAINER" >/dev/null
echo "Dumping database '$DB' ..."
docker run --rm --volumes-from "$CONTAINER" -v "$TMP:/backup" "$IMAGE" \
  neo4j-admin database dump "$DB" --to-path=/backup
restart
trap cleanup EXIT

gzip -c "$TMP/$DB.dump" > "$OUT.partial"
mv "$OUT.partial" "$OUT"
echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# Rotation: keep the newest $KEEP copies.
ls -1t "$BACKUP_DIR/${DB}"-*.dump.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  echo "Removing old backup: $old"
  rm -f -- "$old"
done
