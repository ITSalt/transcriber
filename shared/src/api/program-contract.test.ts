import { describe, it, expect } from 'vitest';
import {
  LoginRequest,
  MeResponse,
  PIN_PATTERN,
  LOGIN_MAX_FAILED_ATTEMPTS,
} from './auth.js';
import { PROGRAM_ERRORS, PROGRAM_ERROR_MESSAGES, ProgramErrorCode } from './errors.js';
import { LEGACY_WORKSPACE_ID, WorkspaceMeetingListItem, WorkspaceMeetingListQuery } from './workspace.js';
import { ParticipantInput, ParticipantUpdate, ProjectCreateRequest, ProjectUpdateRequest, GlossaryTermInput, GlossaryTermUpdate } from './project.js';
import {
  MeetingContextPutRequest,
  PreviousProtocol,
  MeetingContextSnapshot,
  canonicalSnapshotJson,
  PREVIOUS_PROTOCOL_MAX_CHARS,
  StartMeetingResponse,
} from './context.js';
import {
  FeedbackFields,
  FeedbackExtract,
  checkFeedbackSubmission,
  DOCX_MIME,
  FEEDBACK_FILE_MAX_BYTES,
  ProtocolVersionListResponse,
} from './feedback.js';
import {
  canTransitionTaskStatus,
  TaskPatchRequest,
  TaskCode,
  GraphOutboxEntry,
  TaskEvent,
} from './memory.js';
import { UploadCompleteRequest, UploadFinalizeResponse, UploadInitRequest } from './uc100.js';
import { MeetingStatus } from '../enums.js';
import {
  renderLlmContextSections,
  isLlmContextEmpty,
  NoProjectMemoryProvider,
  getProjectMemoryProvider,
  setProjectMemoryProvider,
} from '../llm/index.js';

const uuid = '00000000-0000-4000-8000-0000000000aa';
const now = new Date().toISOString();

// ─── FR-003: PIN / login ──────────────────────────────────────────────────────

describe('LoginRequest (D-8: PIN = exactly 6 digits)', () => {
  it.each(['000000', '123456', '987654'])('accepts %s', (pin) => {
    expect(LoginRequest.parse({ pin })).toEqual({ pin });
  });

  it.each(['12345', '1234567', '12a456', ' 123456', '123 456', '', '１２３４５６'])('rejects %j', (pin) => {
    expect(LoginRequest.safeParse({ pin }).success).toBe(false);
  });

  it('rejects a number instead of a string and a missing pin', () => {
    expect(LoginRequest.safeParse({ pin: 123456 }).success).toBe(false);
    expect(LoginRequest.safeParse({}).success).toBe(false);
    expect(PIN_PATTERN.test('123456')).toBe(true);
  });

  it('carries the owner-approved block text and the 10-attempt limit', () => {
    expect(PROGRAM_ERROR_MESSAGES.LOGIN_BLOCKED).toBe('Больше нельзя, пиши Максу для разблокировки');
    expect(PROGRAM_ERRORS.LOGIN_BLOCKED).toBe(423);
    expect(PROGRAM_ERRORS.INVALID_PIN).toBe(401);
    expect(PROGRAM_ERRORS.PIN_FORMAT).toBe(400);
    expect(LOGIN_MAX_FAILED_ATTEMPTS).toBe(10);
  });

  it('has a message for every error code', () => {
    for (const code of ProgramErrorCode.options) {
      expect(PROGRAM_ERROR_MESSAGES[code]).toMatch(/\S/);
    }
  });

  it('MeResponse requires user and workspaces', () => {
    const me = { user: { id: uuid, name: 'Роман' }, workspaces: [{ id: LEGACY_WORKSPACE_ID, name: 'Роман', personal: true }] };
    expect(MeResponse.parse(me)).toEqual(me);
    expect(MeResponse.safeParse({ user: me.user }).success).toBe(false);
  });
});

// ─── FR-003: workspaces / meetings ───────────────────────────────────────────

describe('workspace meeting list', () => {
  it('LEGACY_WORKSPACE_ID is a valid uuid (same literal as the migration)', () => {
    expect(WorkspaceMeetingListQuery.parse({ workspace_id: LEGACY_WORKSPACE_ID })).toBeTruthy();
  });

  it('rejects a non-uuid workspace_id', () => {
    expect(WorkspaceMeetingListQuery.safeParse({ workspace_id: 'roman' }).success).toBe(false);
  });

  it('list item accepts AWAITING_START and a null project', () => {
    const item = {
      id: uuid, title: 't', filename: 'f.mp4', status: 'AWAITING_START', language: 'RU',
      uploaded_at: now, updated_at: now, duration_sec: null,
      workspace_id: LEGACY_WORKSPACE_ID, project_id: null, project_name: null,
    };
    expect(WorkspaceMeetingListItem.parse(item)).toEqual(item);
    expect(MeetingStatus.parse('AWAITING_START')).toBe('AWAITING_START');
  });
});

describe('upload schemas stay backward compatible', () => {
  const complete = {
    s3_key: 'pending/x.mp4', s3_upload_id: 'u', filename: 'x.mp4', size_bytes: 10,
    filetype: 'video/mp4', title: 'x', language: null, parts: [{ part_number: 1, etag: 'e' }],
  };

  it('a pre-program complete request still parses (no workspace_id / defer_start)', () => {
    const parsed = UploadCompleteRequest.parse(complete);
    expect(parsed.defer_start).toBeUndefined();
    expect(parsed.workspace_id).toBeUndefined();
  });

  it('accepts defer_start and workspace_id', () => {
    expect(UploadCompleteRequest.parse({ ...complete, defer_start: true, workspace_id: uuid }).defer_start).toBe(true);
    expect(UploadInitRequest.safeParse({ filename: 'x.mp4', size_bytes: 1, filetype: 'video/mp4', title: 'x', language: null, workspace_id: 'nope' }).success).toBe(false);
  });

  it('finalize response allows TRANSCRIBING and AWAITING_START only', () => {
    expect(UploadFinalizeResponse.parse({ meeting_id: uuid, status: 'TRANSCRIBING' }).status).toBe('TRANSCRIBING');
    expect(UploadFinalizeResponse.parse({ meeting_id: uuid, status: 'AWAITING_START' }).status).toBe('AWAITING_START');
    expect(UploadFinalizeResponse.safeParse({ meeting_id: uuid, status: 'UPLOADED' }).success).toBe(false);
  });
});

// ─── FR-004: projects / context ───────────────────────────────────────────────

describe('project schemas', () => {
  it('participant defaults side OTHER and empty aliases; trims the name', () => {
    expect(ParticipantInput.parse({ name: '  Иванов ' })).toEqual({ name: 'Иванов', aliases: [], side: 'OTHER' });
  });

  it('rejects an unknown side and a blank name', () => {
    expect(ParticipantInput.safeParse({ name: 'A', side: 'PARTNER' }).success).toBe(false);
    expect(ParticipantInput.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('glossary term defaults asr_keyterm=false', () => {
    expect(GlossaryTermInput.parse({ term: 'Nova-3' }).asr_keyterm).toBe(false);
  });

  it('PATCH bodies return only the keys that were sent (no defaults reset omitted fields)', () => {
    expect(ParticipantUpdate.parse({ name: 'Иван' })).toEqual({ name: 'Иван' });
    expect(ParticipantUpdate.parse({ side: 'CLIENT', role: null })).toEqual({ side: 'CLIENT', role: null });
    expect(GlossaryTermUpdate.parse({ definition: 'x' })).toEqual({ definition: 'x' });
    expect(GlossaryTermUpdate.parse({ asr_keyterm: true })).toEqual({ asr_keyterm: true });
    expect(ParticipantUpdate.safeParse({}).success).toBe(false);
    expect(GlossaryTermUpdate.safeParse({}).success).toBe(false);
    expect(ParticipantUpdate.safeParse({ side: 'PARTNER' }).success).toBe(false);
  });

  it('project create needs workspace_id; an empty update is rejected', () => {
    expect(ProjectCreateRequest.safeParse({ name: 'P' }).success).toBe(false);
    expect(ProjectCreateRequest.parse({ workspace_id: uuid, name: 'P' }).name).toBe('P');
    expect(ProjectUpdateRequest.safeParse({}).success).toBe(false);
  });
});

describe('meeting context', () => {
  it('an empty body is a valid "no context" draft', () => {
    expect(MeetingContextPutRequest.parse({})).toEqual({
      project_id: null, meeting_type: null, goal: null, agenda: null,
      participants: [], glossary: [], previous_protocol: { source: 'none' }, notes: null,
    });
  });

  it('accepts a full context with additions', () => {
    const body = {
      project_id: uuid,
      meeting_type: 'NEGOTIATION',
      goal: 'Договориться о сроках',
      agenda: '1. Сроки\n2. Цена',
      participants: [{ name: 'Иванов', aliases: ['Ваня'], role: 'CTO', organization: 'ООО Ромашка', side: 'CLIENT' }],
      glossary: [{ term: 'Deepgram', asr_keyterm: true }],
      previous_protocol: { source: 'upload', text: '# Протокол' },
      notes: 'Говорить про сроки',
    };
    const parsed = MeetingContextPutRequest.parse(body);
    expect(parsed.participants[0]).toMatchObject({ source: 'meeting', participant_id: null, side: 'CLIENT' });
    expect(parsed.glossary[0]).toMatchObject({ source: 'meeting', asr_keyterm: true, variants: [] });
  });

  it('rejects project-sourced entries in a PUT, an unknown meeting type, bad previous protocol', () => {
    expect(MeetingContextPutRequest.safeParse({ participants: [{ name: 'A', source: 'project' }] }).success).toBe(false);
    expect(MeetingContextPutRequest.safeParse({ meeting_type: 'STANDUP' }).success).toBe(false);
    expect(PreviousProtocol.safeParse({ source: 'upload', text: '' }).success).toBe(false);
    expect(PreviousProtocol.safeParse({ source: 'upload', text: 'x'.repeat(PREVIOUS_PROTOCOL_MAX_CHARS + 1) }).success).toBe(false);
    // D-25: exactly 50 000 characters
    expect(PREVIOUS_PROTOCOL_MAX_CHARS).toBe(50_000);
    expect(PreviousProtocol.safeParse({ source: 'upload', text: 'x'.repeat(50_000) }).success).toBe(true);
    expect(PreviousProtocol.safeParse({ source: 'upload', text: 'x'.repeat(50_001) }).success).toBe(false);
    expect(PreviousProtocol.safeParse({ source: 'email' }).success).toBe(false);
    expect(PreviousProtocol.parse({ source: 'project' })).toEqual({ source: 'project', meeting_id: null, text: null });
  });

  it('canonicalSnapshotJson is key-order independent and changes with content', () => {
    const a = MeetingContextSnapshot.parse({
      meeting_type: 'STATUS', goal: 'g', agenda: null, notes: null,
      participants: [{ name: 'A' }], glossary: [], previous_protocol: { source: 'none' },
    });
    const b = JSON.parse(JSON.stringify({ notes: a.notes, previous_protocol: a.previous_protocol, glossary: a.glossary, participants: a.participants, agenda: a.agenda, goal: a.goal, meeting_type: a.meeting_type }));
    expect(canonicalSnapshotJson(b)).toBe(canonicalSnapshotJson(a));
    expect(canonicalSnapshotJson({ ...a, goal: 'other' })).not.toBe(canonicalSnapshotJson(a));
  });

  it('start response is TRANSCRIBING', () => {
    expect(StartMeetingResponse.safeParse({ meeting_id: uuid, status: 'AWAITING_START', snapshot_hash: null }).success).toBe(false);
  });
});

// ─── FR-005: versions / feedback ──────────────────────────────────────────────

describe('feedback', () => {
  const docx = { fileName: 'review.DOCX', mime: DOCX_MIME, sizeBytes: 1000 };

  it('COMMENT needs text, optional category, no file', () => {
    expect(checkFeedbackSubmission(FeedbackFields.parse({ kind: 'COMMENT', text: 'Спикер перепутан', category: 'SPEAKER_ATTRIBUTION' }), null)).toBeNull();
    expect(checkFeedbackSubmission(FeedbackFields.parse({ kind: 'COMMENT' }), null)).toBe('FEEDBACK_TEXT_REQUIRED');
    expect(checkFeedbackSubmission(FeedbackFields.parse({ kind: 'COMMENT', text: 'x' }), docx)).toBe('FEEDBACK_FILE_TYPE');
  });

  it('CORRECTED_PROTOCOL takes text or a .md/.txt/.docx file', () => {
    const fields = FeedbackFields.parse({ kind: 'CORRECTED_PROTOCOL' });
    expect(checkFeedbackSubmission(fields, null)).toBe('FEEDBACK_TEXT_REQUIRED');
    expect(checkFeedbackSubmission(FeedbackFields.parse({ kind: 'CORRECTED_PROTOCOL', text: '# fixed' }), null)).toBeNull();
    expect(checkFeedbackSubmission(fields, { fileName: 'p.md', mime: 'text/markdown', sizeBytes: 10 })).toBeNull();
    expect(checkFeedbackSubmission(fields, { fileName: 'p.md', mime: 'text/markdown; charset=utf-8', sizeBytes: 10 })).toBeNull();
    expect(checkFeedbackSubmission(fields, { fileName: 'p.txt', mime: 'Text/Plain ; charset=UTF-8', sizeBytes: 10 })).toBeNull();
    expect(checkFeedbackSubmission(fields, docx)).toBeNull();
    expect(checkFeedbackSubmission(fields, { fileName: 'p.pdf', mime: 'application/pdf', sizeBytes: 10 })).toBe('FEEDBACK_FILE_TYPE');
  });

  it('DOCX_REVIEW needs a .docx of at most 20 MB with a docx mime', () => {
    const fields = FeedbackFields.parse({ kind: 'DOCX_REVIEW' });
    expect(checkFeedbackSubmission(fields, null)).toBe('FEEDBACK_FILE_REQUIRED');
    expect(checkFeedbackSubmission(fields, docx)).toBeNull();
    expect(checkFeedbackSubmission(fields, { ...docx, sizeBytes: FEEDBACK_FILE_MAX_BYTES + 1 })).toBe('FEEDBACK_FILE_TOO_LARGE');
    expect(checkFeedbackSubmission(fields, { ...docx, fileName: 'r.doc' })).toBe('FEEDBACK_FILE_TYPE');
    expect(checkFeedbackSubmission(fields, { ...docx, mime: 'image/png' })).toBe('FEEDBACK_FILE_TYPE');
  });

  it('rejects unknown kind / category and blank text', () => {
    expect(FeedbackFields.safeParse({ kind: 'RATING' }).success).toBe(false);
    expect(FeedbackFields.safeParse({ kind: 'COMMENT', category: 'TYPO' }).success).toBe(false);
    expect(FeedbackFields.safeParse({ kind: 'COMMENT', text: '   ' }).success).toBe(false);
  });

  it('FeedbackExtract fills defaults (parse failure keeps only error)', () => {
    expect(FeedbackExtract.parse({ error: 'not a zip' })).toEqual({
      comments: [], revisions: [], accepted_text: null, original_text: null, plain_text: null, error: 'not a zip',
    });
    const extract = FeedbackExtract.parse({
      comments: [{ id: '0', author: 'Макс', date: null, text: 'не так', anchored_text: 'решили' }],
      revisions: [{ type: 'ins', author: 'Макс', date: now, text: 'добавлено' }, { type: 'del', author: null, date: null, text: 'удалено' }],
      accepted_text: 'a', original_text: 'o',
    });
    expect(extract.revisions).toHaveLength(2);
    expect(FeedbackExtract.safeParse({ revisions: [{ type: 'move', author: null, date: null, text: '' }] }).success).toBe(false);
  });

  it('version list carries LEGACY versions without author', () => {
    const v = { items: [{ n: 1, kind: 'LEGACY', author: null, generation_id: null, created_at: now }], current_n: 1 };
    expect(ProtocolVersionListResponse.parse(v)).toEqual(v);
  });
});

// ─── FR-006: memory ───────────────────────────────────────────────────────────

describe('project memory', () => {
  it('status transitions', () => {
    expect(canTransitionTaskStatus('OPEN', 'DONE')).toBe(true);
    expect(canTransitionTaskStatus('DONE', 'OPEN')).toBe(true);
    expect(canTransitionTaskStatus('DONE', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionTaskStatus('OPEN', 'OPEN')).toBe(false);
  });

  it('task codes and patch body', () => {
    expect(TaskCode.safeParse('T-42').success).toBe(true);
    expect(TaskCode.safeParse('T-0').success).toBe(false);
    expect(TaskPatchRequest.safeParse({}).success).toBe(false);
    expect(TaskPatchRequest.safeParse({ due_date: '15.10.2026' }).success).toBe(false);
    expect(TaskPatchRequest.parse({ status: 'DONE', due_date: null })).toEqual({ status: 'DONE', due_date: null });
  });

  it('task event review states and confidence bounds', () => {
    const e = {
      id: uuid, task_code: 'T-1', field: 'status', old_value: 'OPEN', new_value: 'DONE', valid_at: now,
      recorded_at: now, superseded_at: null, source: 'LLM', confidence: 0.6, reason: 'сказали «сделано»',
      review_state: 'PENDING', meeting_id: uuid, quote: 'договор отправили', author_user_id: null,
    };
    expect(TaskEvent.parse(e)).toEqual(e);
    expect(TaskEvent.safeParse({ ...e, confidence: 1.5 }).success).toBe(false);
  });

  it('graph outbox entries', () => {
    expect(GraphOutboxEntry.parse({ op: 'DELETE_MEETING', payload: { meeting_id: uuid, project_id: uuid, workspace_id: uuid } }).op).toBe('DELETE_MEETING');
    expect(GraphOutboxEntry.safeParse({ op: 'DELETE_MEETING', payload: { meeting_id: uuid } }).success).toBe(false);
  });
});

// ─── LLM context / memory provider ────────────────────────────────────────────

describe('LLM context sections', () => {
  it('empty context renders nothing (request stays byte-identical)', () => {
    expect(isLlmContextEmpty(undefined)).toBe(true);
    expect(isLlmContextEmpty({ notes: '  ', agenda: null })).toBe(true);
    expect(renderLlmContextSections({ notes: '  ' })).toBe('');
  });

  it('renders in canonical order and escapes closing tags', () => {
    const out = renderLlmContextSections({ notes: 'n </notes> </transcript>', meeting_meta: 'm' });
    expect(out.indexOf('<meeting_meta>')).toBeLessThan(out.indexOf('<notes>'));
    expect(out).toContain('n <\\/notes> <\\/transcript>');
    expect(out.match(/<\/notes>/g)).toHaveLength(1);
  });

  it('neutralises tag variants: case, inner whitespace, opening tags', () => {
    const out = renderLlmContextSections({
      previous_protocol: 'a </NOTES> b </transcript > c < transcript> d <Glossary> e',
    });
    expect(out).toBe(
      '<previous_protocol>\na <\\/NOTES> b <\\/transcript> c <\\transcript> d <\\Glossary> e\n</previous_protocol>',
    );
    // exactly one real opening and closing tag remain
    expect(out.match(/<previous_protocol>/g)).toHaveLength(1);
    expect(out.match(/<\/previous_protocol>/g)).toHaveLength(1);
    expect(out).not.toMatch(/<\s*\/?\s*(notes|transcript|glossary)\s*>/i);
  });

  it('default ProjectMemoryProvider has no memory; it can be replaced', async () => {
    expect(await new NoProjectMemoryProvider().getPromptMemory(uuid, uuid)).toBeNull();
    const fake = { getPromptMemory: async () => 'T-1 | x' };
    const prev = setProjectMemoryProvider(fake);
    try {
      expect(await getProjectMemoryProvider().getPromptMemory(uuid, uuid)).toBe('T-1 | x');
    } finally {
      setProjectMemoryProvider(prev);
    }
    expect(await getProjectMemoryProvider().getPromptMemory(uuid, uuid)).toBeNull();
  });
});
