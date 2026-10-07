#!/usr/bin/env bash
# Restore the project-memory Neo4j from a backup made by neo4j-backup.sh.
# DESTRUCTIVE: overwrites the current contents of the database.
#
# Usage: scripts/neo4j-restore.sh <backup.dump.gz>
# Env (optional): NEO4J_CONTAINER, NEO4J_DATABASE (default neo4j)
set -euo pipefail

FILE="${1:-}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "Usage: $0 <backup.dump.gz>" >&2; exit 1; }
DB="${NEO4J_DATABASE:-neo4j}"
CONTAINER="${NEO4J_CONTAINER:-$(docker compose ps -aq memory-neo4j 2>/dev/null || true)}"
[ -n "$CONTAINER" ] || { echo "ERROR: memory-neo4j container not found (set NEO4J_CONTAINER)" >&2; exit 1; }
# NEO4J_CONTAINER is taken blindly otherwise; the prod docker daemon hosts foreign Neo4j containers.
svc="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.service" }}' "$CONTAINER")"
[ "$svc" = "memory-neo4j" ] || { echo "ERROR: $CONTAINER is not the memory-neo4j compose service (label: '${svc}')" >&2; exit 1; }

IMAGE="$(docker inspect -f '{{.Config.Image}}' "$CONTAINER")"
TMP="$(mktemp -d)"
chmod 755 "$TMP"
restart() { docker start "$CONTAINER" >/dev/null || echo "WARN: failed to restart $CONTAINER" >&2; }
trap 'restart; rm -rf "$TMP"' EXIT

gzip -dc "$FILE" > "$TMP/$DB.dump"
chmod 644 "$TMP/$DB.dump"

echo "Stopping $CONTAINER ..."
docker stop "$CONTAINER" >/dev/null
echo "Loading $FILE into '$DB' ..."
docker run --rm --volumes-from "$CONTAINER" -v "$TMP:/backup:ro" "$IMAGE" \
  neo4j-admin database load "$DB" --from-path=/backup --overwrite-destination=true
echo "Restore complete; starting $CONTAINER ..."
