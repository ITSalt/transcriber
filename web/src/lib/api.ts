/** Minimal structural type compatible with both Zod v3 and v4 schemas. */
interface ZodLike<T> {
  parse(data: unknown): T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** machine code of the API error body (e.g. INVALID_PIN, LOGIN_BLOCKED) */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 404 NOT_FOUND: someone else's and a nonexistent resource look the same. */
export function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}

// ── Session plumbing (FR-003) ────────────────────────────────────────────────

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/** Called on any 401 except the login request itself (session expired / missing). */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

let workspaceIdProvider: () => string | undefined = () => undefined;

/** The session layer registers the currently selected workspace here. */
export function setWorkspaceIdProvider(fn: () => string | undefined): void {
  workspaceIdProvider = fn;
}

const PUBLIC_PATHS = new Set(["/api/auth/login"]);

function notifyUnauthorized(path: string, status: number): void {
  if (status === 401 && !PUBLIC_PATHS.has(path)) {
    unauthorizedListeners.forEach((l) => l());
  }
}

/**
 * Upload endpoints take the target workspace in the JSON body (shared uc100.ts).
 * The upload page predates workspaces, so the current one is added here.
 */
function withWorkspace(path: string, body: BodyInit | null | undefined) {
  if (typeof body !== "string" || !path.startsWith("/api/uploads/")) return body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const id = workspaceIdProvider();
    if (id && parsed.workspace_id === undefined) {
      return JSON.stringify({ ...parsed, workspace_id: id });
    }
  } catch {
    // not JSON — leave as is
  }
  return body;
}

async function request<T>(
  path: string,
  init: RequestInit,
  schema: ZodLike<T>,
): Promise<T> {
  const hasBody = init.body != null;
  const res = await fetch(path, {
    ...init,
    body: withWorkspace(path, init.body),
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { message?: string; code?: string };
      if (body.message) message = body.message;
      code = body.code;
    } catch {
      // ignore parse failure
    }
    notifyUnauthorized(path, res.status);
    throw new ApiError(res.status, message, code);
  }

  const json: unknown = await res.json();
  return schema.parse(json);
}

export function apiGet<T>(path: string, schema: ZodLike<T>): Promise<T> {
  return request(path, { method: "GET" }, schema);
}

export function apiPost<T>(
  path: string,
  body: unknown,
  schema: ZodLike<T>,
): Promise<T> {
  return request(
    path,
    { method: "POST", body: JSON.stringify(body) },
    schema,
  );
}

export function apiPatch<T>(
  path: string,
  body: unknown,
  schema: ZodLike<T>,
): Promise<T> {
  return request(
    path,
    { method: "PATCH", body: JSON.stringify(body) },
    schema,
  );
}

export function apiPut<T>(
  path: string,
  body: unknown,
  schema: ZodLike<T>,
): Promise<T> {
  return request(
    path,
    { method: "PUT", body: JSON.stringify(body) },
    schema,
  );
}

/** POST that answers 204 No Content (e.g. logout). */
export async function apiPostNoContent(path: string): Promise<void> {
  const res = await fetch(path, { method: "POST" });
  if (!res.ok) {
    notifyUnauthorized(path, res.status);
    throw new ApiError(res.status, res.statusText);
  }
}

export function apiPostEmpty<T>(path: string, schema: ZodLike<T>): Promise<T> {
  return request(path, { method: "POST" }, schema);
}

export function apiDelete(path: string): Promise<void>;
export function apiDelete<T>(path: string, schema: ZodLike<T>): Promise<T>;
export function apiDelete<T>(
  path: string,
  schema?: ZodLike<T>,
): Promise<T | void> {
  if (schema) {
    return request(path, { method: "DELETE" }, schema);
  }
  return fetch(path, { method: "DELETE" }).then((res) => {
    if (!res.ok) {
      notifyUnauthorized(path, res.status);
      throw new ApiError(res.status, res.statusText);
    }
  });
}
