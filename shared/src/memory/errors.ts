/**
 * FR-006 — typed errors of the memory access layer. `code` matches PROGRAM_ERRORS where the
 * API maps them 1:1 (shared/src/api/errors.ts); the API turns them into its AppError.
 */
import type { ProgramErrorCode } from '../api/errors.js';

export class MemoryError extends Error {
  constructor(
    public readonly code: ProgramErrorCode | 'MEMORY_CONCURRENT_UPDATE' | 'MEMORY_INVALID_EVENT',
    message: string,
  ) {
    super(message);
    this.name = 'MemoryError';
  }
}

/** Task / event not found in this scope (or in the caller's workspaces) → 404. */
export class MemoryNotFoundError extends MemoryError {
  constructor(what: string) {
    super('NOT_FOUND', `${what} not found`);
    this.name = 'MemoryNotFoundError';
  }
}

/** Confirm / reject of an event that is no longer PENDING → 409. */
export class TaskEventAlreadyReviewedError extends MemoryError {
  constructor(eventId: string, state: string) {
    super('TASK_EVENT_ALREADY_REVIEWED', `task event ${eventId} is already ${state}`);
    this.name = 'TaskEventAlreadyReviewedError';
  }
}

/** Status change that canTransitionTaskStatus forbids → 400. */
export class TaskStatusTransitionError extends MemoryError {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super('TASK_STATUS_TRANSITION', `task status transition ${from} → ${to} is not allowed`);
    this.name = 'TaskStatusTransitionError';
  }
}

/** The project's counters moved between planning and writing a meeting update — retry the job. */
export class MemoryConcurrencyError extends MemoryError {
  constructor(message: string) {
    super('MEMORY_CONCURRENT_UPDATE', message);
    this.name = 'MemoryConcurrencyError';
  }
}

/** An event cannot be applied (e.g. merged_into a task that no longer exists). */
export class MemoryInvalidEventError extends MemoryError {
  constructor(message: string) {
    super('MEMORY_INVALID_EVENT', message);
    this.name = 'MemoryInvalidEventError';
  }
}
