import type { ReactNode } from "react";
import { vi } from "vitest";
import type { MeResponse } from "@transcrib/shared";
import { SessionProvider } from "@/lib/session";

// Valid v4 UUIDs — Zod v4 validates uuid format strictly
export const WS_PERSONAL = "c0000000-0000-4000-8000-000000000001";
export const WS_SHARED = "c0000000-0000-4000-8000-000000000002";
export const USER_ID = "d0000000-0000-4000-8000-000000000001";

export const ME: MeResponse = {
  user: { id: USER_ID, name: "Роман" },
  workspaces: [
    { id: WS_PERSONAL, name: "Роман", personal: true },
    { id: WS_SHARED, name: "Команда", personal: false },
  ],
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Wraps a page in the session the AppShell would provide. */
export function WithSession({
  me = ME,
  children,
}: {
  me?: MeResponse;
  children: ReactNode;
}) {
  return <SessionProvider me={me}>{children}</SessionProvider>;
}

type Handler = (url: URL, init: RequestInit | undefined) => Response | undefined;

/**
 * Routes `fetch` by pathname; first handler returning a Response wins,
 * anything unhandled answers 404 so a missing mock is loud.
 */
export function mockApi(...handlers: Handler[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = new URL(String(input), "http://localhost");
    for (const h of handlers) {
      const res = h(url, init);
      if (res) return Promise.resolve(res);
    }
    return Promise.resolve(json({ code: "NOT_FOUND", message: "Не найдено" }, 404));
  });
}
