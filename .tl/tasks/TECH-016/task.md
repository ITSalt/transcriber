---
id: TECH-016
title: Cloud.ru S3 bucket + service account
type: tech
wave: 7
priority: high
depends_on: []
owner: user
---

# TECH-016 — Cloud.ru S3 bucket + service account

## What

Create a dedicated Cloud.ru Object Storage bucket and a scoped service account for the Transcrib production environment. This task is **manual** — performed by the project owner in the Cloud.ru web console — because creating IAM principals requires panel/API access not available to deploy automation.

Full step-by-step instructions are in `.tl/deploy-plan.md` § 3. Summary:

## Deliverables

1. Bucket `transcrib-itsalt-prod` in region `ru-central-1`, access **Private**.
2. Lifecycle rule `expire-after-3d`:
   - Expire (delete) all objects 3 days after creation.
   - Abort incomplete multipart uploads after 1 day.
3. Service account `transcrib-prod` with a policy granting only `transcrib-itsalt-prod` access — actions: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`, `s3:AbortMultipartUpload`, `s3:ListBucketMultipartUploads`, `s3:ListMultipartUploadParts`.
4. Access key + secret key generated and stored securely (will be pasted into `/opt/transcrib/.env` during TECH-018).

## Verification

- `aws --endpoint-url https://s3.cloud.ru s3 ls s3://transcrib-itsalt-prod` returns empty list (not "AccessDenied"), authenticated with the new keys.
- `aws --endpoint-url https://s3.cloud.ru s3 ls s3://learn-itsalt-prod` returns **AccessDenied** when using the new keys (scoping is correct).
- A test object `aws s3 cp test.txt s3://transcrib-itsalt-prod/test.txt` succeeds; HEAD on the object shows an `Expiration:` response header pointing 3 days into the future (lifecycle rule confirmed).

## Definition of done

- [ ] Bucket exists with the listed name and region.
- [ ] Lifecycle rule confirmed via HEAD response header on a test object.
- [ ] Service account credentials handed to the operator (me) over a secure channel; keys are NOT shared with the learn service account.
- [ ] Verification commands all pass.
