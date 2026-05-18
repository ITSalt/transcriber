# TECH-016 — Implementation brief

This task is executed entirely in the Cloud.ru web console; there is no code or automation. The full click-by-click runbook is in `.tl/deploy-plan.md` § 3.

## Why a separate bucket and service account?

- **Blast radius:** if either set of keys leaks, only one project is affected.
- **Audit clarity:** Cloud.ru access logs (when enabled) are filterable per service account.
- **Independent quotas:** if Transcrib bursts in upload volume (UC-100 is the entry point for very large videos), it cannot starve learn's storage budget.

## Why 3-day lifecycle?

- Per product decision: source videos and transcripts are working artefacts; meeting protocols (the user-facing output) live in Postgres as Markdown.
- Lifecycle on Cloud.ru is enforced by the storage provider — we do not need an application cron.
- "Abort incomplete multipart uploads after 1 day" prevents partial TUS uploads from accumulating storage cost when a client disappears mid-upload.

## Why these specific IAM actions?

| Action | Used by |
|---|---|
| `s3:PutObject` + `s3:AbortMultipartUpload` + multipart-list actions | TUS uploads in `worker/` and `api/` (large file ingest, UC-100) |
| `s3:GetObject` | Worker reads video for ffmpeg + Puppeteer reads PDF assets if any (UC-200, UC-302) |
| `s3:DeleteObject` | UC-003 (delete meeting) cleans up source files; also lifecycle uses bucket-level perms |
| `s3:ListBucket` | Healthcheck and operational tooling |

No `s3:PutBucket*` / `s3:PutBucketLifecycle*` etc. — bucket configuration is owner-only and cannot be mutated by the app.
