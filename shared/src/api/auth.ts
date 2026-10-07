import { z } from 'zod';
import { WorkspaceSummary } from './workspace.js';

// FR-003 — login by PIN, current user, logout (contract v1; logic: WP-BACKEND-01).
//
//   POST /api/auth/login   body LoginRequest  → 200 MeResponse + Set-Cookie SESSION_COOKIE_NAME
//                                              → 400 PIN_FORMAT | 401 INVALID_PIN | 423 LOGIN_BLOCKED
//   GET  /api/auth/me                          → 200 MeResponse | 401 UNAUTHENTICATED
//   POST /api/auth/logout                      → 204 (cookie cleared; idempotent)
//
// Public routes: GET /api/health and POST /api/auth/login. Everything else under /api/*
// answers 401 UNAUTHENTICATED without a valid session.

/** D-8: exactly six digits; unique among users. */
export const PIN_PATTERN = /^\d{6}$/;
export const Pin = z.string().regex(PIN_PATTERN);
export type Pin = z.infer<typeof Pin>;

/** D-8 / A-3: failures from one client before it is blocked (manual unblock only). */
export const LOGIN_MAX_FAILED_ATTEMPTS = 10;
/** A-3: global failures per hour above which the API logs a warning. */
export const LOGIN_GLOBAL_FAILURES_WARN_PER_HOUR = 100;
/** LoginBlock.clientKey of the global failure counter row. */
export const LOGIN_GLOBAL_CLIENT_KEY = '*';

/** httpOnly; Secure; SameSite=Lax; Path=/ — the value is the raw token, the DB keeps sha256. */
export const SESSION_COOKIE_NAME = 'transcrib_session';
export const SESSION_TTL_DAYS = 30;

export const LoginRequest = z.object({
  pin: Pin,
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const AuthUser = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
});
export type AuthUser = z.infer<typeof AuthUser>;

/** Response of GET /api/auth/me and POST /api/auth/login. */
export const MeResponse = z.object({
  user: AuthUser,
  /** every workspace the user is a member of; the personal one first */
  workspaces: z.array(WorkspaceSummary),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const LoginResponse = MeResponse;
export type LoginResponse = MeResponse;
