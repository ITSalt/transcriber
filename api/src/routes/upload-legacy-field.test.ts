/**
 * WP-BACKEND-08 / D-43: a cached SPA may still send `speaker_count` to the upload endpoints.
 * The request schemas strip unknown keys (non-strict Zod) — the request must validate, not 400.
 */
import { describe, it, expect } from 'vitest'
import { UploadInitRequest, UploadCompleteRequest } from '@transcrib/shared'

describe('legacy speaker_count from a cached SPA', () => {
  it('UploadInitRequest accepts and strips speaker_count', () => {
    const parsed = UploadInitRequest.safeParse({
      filename: 'a.mp4',
      size_bytes: 1000,
      filetype: 'video/mp4',
      title: 'T',
      language: null,
      speaker_count: 3,
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'speaker_count' in parsed.data).toBe(false)
  })

  it('UploadCompleteRequest accepts and strips speaker_count', () => {
    const parsed = UploadCompleteRequest.safeParse({
      s3_key: 'k',
      s3_upload_id: 'u',
      filename: 'a.mp4',
      size_bytes: 1000,
      filetype: 'video/mp4',
      title: 'T',
      language: null,
      speaker_count: 3,
      parts: [{ part_number: 1, etag: 'e' }],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'speaker_count' in parsed.data).toBe(false)
  })
})
