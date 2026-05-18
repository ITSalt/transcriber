# TECH-007 — Implementation Brief

## Step plan

1. Define IStorage interface in shared/.
2. Implement s3-adapter against MinIO endpoint.
3. Add s3:// URI utility for path manipulation.
4. Wire bucket name + creds from config.
