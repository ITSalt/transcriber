# Feature Request: FR-004 — Projects and meeting context with deferred start

## Metadata

| Field | Value |
|-------|-------|
| Created | 2026-10-07 |
| Status | spec-complete |
| Source | `/nacl-sa-feature` — program «Модернизация Transcrib до продукта», WP-BACKEND-06 (contract v1) |
| Impact method | Neo4j graph traversal (sa_impact_analysis) + program decisions |
| Decision | `DEC-007` (program: D-9, D-10, Q-1, Q-2) |
| Implemented by | WP-API-PROJECTS-01 (API), WP-WEB-PROJECTS-01 (UI), WP-WORKER-01 (keyterms + LLM sections) |

## Feature Description

Projects of a workspace carry participants and a glossary. On the upload screen the
author fills an optional meeting context while the file uploads; the upload completes
with `defer_start` (status `AWAITING_START`), and «Начать распознавание» freezes the
context into an immutable snapshot that feeds ASR keyterms and the LLM context sections.

## Impact Summary

| Area | Change | Details |
|------|--------|---------|
| Architecture | NEW MODULE | `mod-projects` (UC 500–599) |
| Domain | +4 entities, +2 enums, ~1 modified | Project, ProjectParticipant, GlossaryTerm, MeetingContext; ParticipantSide, MeetingType; Meeting +project_id, MeetingStatus +AWAITING_START |
| Use Cases | +5 NEW | UC-500..UC-504 |
| Use Cases | ~4 MODIFIED | UC-001 (status), UC-100 (defer_start), UC-200 (keyterms), UC-300 (context sections) |
| Requirements | RQ-046..RQ-049 | |

## Contract v1 (code)

- Prisma: `Project`, `ProjectParticipant`, `GlossaryTerm`, `MeetingContext`
  (`snapshotHash` NULL = draft), `Meeting.projectId`, `MeetingStatus.AWAITING_START`.
- `shared/src/api/project.ts`, `shared/src/api/context.ts` (`MeetingContextPutRequest`,
  `MeetingContextSnapshot`, `PreviousProtocol`, `StartMeetingResponse`,
  `canonicalSnapshotJson`, keyterm limits), `uc100.ts` (`defer_start`).
- `IAsrProvider.AudioInput.keyterms`, `ILlmProvider.LlmInput.context` +
  `renderLlmContextSections` / `isLlmContextEmpty` (absent context = byte-identical request).

## New UCs to Plan

- UC-500: Вести проекты пространства. UC-501: Вести участников и глоссарий.
- UC-502: Заполнить контекст встречи при загрузке. UC-503: Начать распознавание.
- UC-504: Посмотреть использованный контекст.

## Modified UCs to Re-plan

- UC-100: `defer_start` → AWAITING_START, nothing enqueued. UC-001: show AWAITING_START.
- UC-200: keyterms from the snapshot behind `ASR_KEYTERMS_ENABLED` (off by default).
- UC-300: LLM context sections; no context → today's request byte for byte.

## Dependencies

- UC-503 enqueues exactly like `finalizeUpload` (`{transcription_job_id, speaker_count}`).
- Worker reads `MeetingContext` only when present (meetings created without `/start` run as today).

## Decisions

- DEC-007: draft until `/start`, then an immutable snapshot with `snapshot_hash`.

## Skills Invoked

- `nacl-sa-feature`.
