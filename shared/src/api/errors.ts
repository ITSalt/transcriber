import { z } from 'zod';

// Program contract v1 (WP-BACKEND-06) — error codes and user-facing texts of the new
// endpoints. Wire shape is the existing AppError body (api/src/plugins/errors.ts):
//   { code: ProgramErrorCode, message: string, details?: unknown }
// `message` carries the Russian UI text below, so the web can show it as is (F02: the 423
// text is shown "из ответа").

export const ApiErrorBody = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

/** Error code → HTTP status of every new endpoint of the program. */
export const PROGRAM_ERRORS = {
  // FR-003 — login / session / access (WP-BACKEND-01)
  PIN_FORMAT: 400,
  INVALID_PIN: 401,
  UNAUTHENTICATED: 401,
  LOGIN_BLOCKED: 423,
  /** someone else's or nonexistent resource — always the same 404 (no existence leak) */
  NOT_FOUND: 404,
  WORKSPACE_REQUIRED: 400,
  // FR-004 — projects / context / start (WP-API-PROJECTS-01)
  MEETING_NOT_AWAITING_START: 409,
  CONTEXT_FROZEN: 409,
  PREVIOUS_PROTOCOL_UNAVAILABLE: 422,
  // FR-005 — versions / feedback (WP-API-FEEDBACK-01)
  PROTOCOL_VERSION_NOT_FOUND: 404,
  FEEDBACK_FILE_REQUIRED: 400,
  FEEDBACK_TEXT_REQUIRED: 400,
  FEEDBACK_FILE_TYPE: 415,
  FEEDBACK_FILE_TOO_LARGE: 413,
  // FR-006 — project memory (WP-API-MEMORY-01)
  TASK_EVENT_ALREADY_REVIEWED: 409,
  TASK_STATUS_TRANSITION: 400,
  MEMORY_UNAVAILABLE: 503,
} as const;

export type ProgramErrorCode = keyof typeof PROGRAM_ERRORS;
export const ProgramErrorCode = z.enum(
  Object.keys(PROGRAM_ERRORS) as [ProgramErrorCode, ...ProgramErrorCode[]],
);

/** Russian UI texts (`message` of the error body). */
export const PROGRAM_ERROR_MESSAGES: Record<ProgramErrorCode, string> = {
  PIN_FORMAT: 'PIN — это 6 цифр',
  INVALID_PIN: 'Неверный PIN',
  UNAUTHENTICATED: 'Нужно войти',
  // D-8 — exact text, owner-approved; returned even for a correct PIN while blocked
  LOGIN_BLOCKED: 'Больше нельзя, пиши Максу для разблокировки',
  NOT_FOUND: 'Не найдено',
  WORKSPACE_REQUIRED: 'Не выбрано пространство',
  MEETING_NOT_AWAITING_START: 'Распознавание уже запущено',
  CONTEXT_FROZEN: 'Контекст нельзя менять после старта распознавания',
  PREVIOUS_PROTOCOL_UNAVAILABLE: 'В проекте ещё нет протокола',
  PROTOCOL_VERSION_NOT_FOUND: 'Такой версии протокола нет',
  FEEDBACK_FILE_REQUIRED: 'Приложите файл',
  FEEDBACK_TEXT_REQUIRED: 'Напишите текст',
  FEEDBACK_FILE_TYPE: 'Этот тип файла не принимается',
  FEEDBACK_FILE_TOO_LARGE: 'Файл слишком большой',
  TASK_EVENT_ALREADY_REVIEWED: 'Это изменение уже рассмотрено',
  TASK_STATUS_TRANSITION: 'Такой переход статуса недопустим',
  MEMORY_UNAVAILABLE: 'Память проекта временно недоступна',
};
