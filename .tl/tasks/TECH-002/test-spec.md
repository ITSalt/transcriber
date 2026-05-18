# TECH-002 — Test Spec

## Acceptance tests

- docker compose up -d brings all services healthy within 60s
- psql DATABASE_URL -c 'SELECT 1' returns 1
- redis-cli -u REDIS_URL PING returns PONG
- mc ls minio/transcrib lists the created bucket
