import type { ZodSchema } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit,
  schema: ZodSchema<T>,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // ignore parse failure
    }
    throw new ApiError(res.status, message);
  }

  const json: unknown = await res.json();
  return schema.parse(json);
}

export function apiGet<T>(path: string, schema: ZodSchema<T>): Promise<T> {
  return request(path, { method: "GET" }, schema);
}

export function apiPost<T>(
  path: string,
  body: unknown,
  schema: ZodSchema<T>,
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
  schema: ZodSchema<T>,
): Promise<T> {
  return request(
    path,
    { method: "PATCH", body: JSON.stringify(body) },
    schema,
  );
}

export function apiDelete(path: string): Promise<void> {
  return fetch(path, { method: "DELETE" }).then((res) => {
    if (!res.ok) throw new ApiError(res.status, res.statusText);
  });
}
