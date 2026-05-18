---
id: UC-301-FE
title: Review and edit protocol — frontend
type: uc-fe
uc: UC-301
module: mod-protocol
actor: AUTHOR
wave: 5
priority: high
depends_on: ['UC-301-BE', 'TECH-013']
blocks: []
---

# UC-301-FE — Review and edit protocol

## User story

> As an Author, I want to review the generated protocol and edit it in a Markdown editor, so I can correct LLM mistakes before sharing.

## Acceptance criteria

- GIVEN Meeting.status in {PROTOCOL_READY, EDITED}, WHEN I open the protocol, THEN it loads in a Markdown editor with rendered preview.
- WHEN I save changes, THEN Protocol.markdown_content is updated, version increments by 1 (BRQ-014), edit_count increments by 1 (BRQ-015), last_edited_at is set, and Meeting.status -> EDITED.
- All edits operate on the canonical Markdown (BRQ-018); preview is a derivation.

## User steps

1. AUTHOR clicks 'Review/Edit protocol' from the meeting detail page (UC-002).
2. Editor renders Markdown via Milkdown WYSIWYG with side-by-side rendered preview. Header shows version + edit_count + last_edited_at.
3. AUTHOR edits content; preview updates live.
4. AUTHOR clicks Save; success indicator shows new version.
5. If AUTHOR navigates away with unsaved changes, browser-native or in-app confirmation warns (RQ-031).
6. AUTHOR can also click 'Export PDF' (calls UC-302 endpoint) or 'Back to meeting'.

## Form fields

| Name | Label | Type | Required | Notes |
|------|-------|------|----------|-------|
| `header` | Protocol editor | header | no | Static heading |
| `markdown_content` | Protocol (Markdown) | textarea (Milkdown WYSIWYG) | yes | Protocol.markdown_content - the editable canonical Markdown |
| `version` | Version | number | yes | Protocol.version (read-only) |
| `edit_count` | Edits | number | yes | Protocol.edit_count (read-only) |
| `last_edited_at` | Last edited | datetime | no | Protocol.last_edited_at |
| `generated_at` | Generated | datetime | yes | Protocol.generated_at |
| `save_button` | Save | button | no | Calls PUT /api/meetings/:id/protocol |
| `export_pdf_button` | Export PDF | button | no | Triggers UC-302 download |
| `back_button` | Back to meeting | button | no | Navigates to UC-002 |

## Requirements

| ID | Type | Priority | Description |
|----|------|----------|-------------|
| RQ-027 | functional | high | Each save increments version by exactly 1 (BRQ-014); monotonic. |
| RQ-028 | functional | high | Each save increments edit_count by exactly 1 (BRQ-015); equals manual-save count since generation. |
| RQ-029 | functional | high | First save: Meeting.status PROTOCOL_READY -> EDITED (BRQ-008). Subsequent saves keep status=EDITED. last_edited_at updated every save. |
| RQ-030 | functional | high | Edits operate on canonical Markdown (BRQ-018); preview is a derivation, never persisted. |
| RQ-031 | functional | medium | Editor warns AUTHOR before navigating away with unsaved changes. |

## Enumerations (UI display + filtering)

#### `MeetingStatus`
- `UPLOADING` — File upload in progress
- `TRANSCRIBING` — Transcription queued or running
- `TRANSCRIPT_READY` — Transcript persisted; protocol not yet started or running
- `PROTOCOL_GENERATING` — Protocol-gen job queued or running
- `PROTOCOL_READY` — Protocol persisted; no manual edits yet
- `EDITED` — Protocol manually edited at least once
- `FAILED` — Non-recoverable pipeline error (terminal, BRQ-009)


## API consumption

Consume endpoints defined in `api-contract.md` (BE side at `UC-301-BE`).
Use the typed `apiClient` from `web/src/lib/api.ts` (TECH-013) and Zod types
from `@transcrib/shared`. Do NOT inline `fetch` calls.

## Definition of done

- [ ] Form rendered with all listed fields; labels localized via i18next (RU + EN).
- [ ] Inline validation matches BE validation (RQ-008/009 for upload, etc.).
- [ ] All `acceptance` criteria pass in E2E via `/nacl-tl-qa UC-301`.
- [ ] BE/FE sync passes (`/nacl-tl-sync UC-301`): types from `@transcrib/shared` only; no mocks.
- [ ] Status-driven gating (RQ-005 etc.) wired via TanStack Query + SSE updates.
- [ ] No raw `fetch` in components — only via `apiClient`.
