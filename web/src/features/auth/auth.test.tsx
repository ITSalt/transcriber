import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import i18n from "@/i18n/config";
import { createAppRoutes } from "@/App";
import { apiPost } from "@/lib/api";
import {
  ME,
  json,
  mockApi,
  WS_PERSONAL,
  WS_SHARED,
} from "@/lib/test-utils";
import { safeNext } from "./LoginPage";

const BLOCKED_TEXT = "Больше нельзя, пиши Максу для разблокировки";
const unauthorized = () =>
  json({ code: "UNAUTHENTICATED", message: "Нужно войти" }, 401);

const row = (id: string, workspace: string, filename: string) => ({
  id,
  workspace_id: workspace,
  project_id: null,
  project_name: null,
  title: null,
  filename,
  status: "PROTOCOL_READY" as const,
  language: "RU" as const,
  uploaded_at: "2026-05-18T10:00:00.000Z",
  updated_at: "2026-05-18T11:00:00.000Z",
  duration_sec: 60,
});

const LISTS: Record<string, unknown> = {
  [WS_PERSONAL]: {
    items: [row("a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6", WS_PERSONAL, "personal.mp4")],
  },
  [WS_SHARED]: {
    items: [row("b2c3d4e5-5678-4bcd-9ef0-b2c3d4e5f6a7", WS_SHARED, "team.mp4")],
  },
};

function renderApp(path: string) {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: [path] });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

async function typePin(pin: string) {
  const first = await screen.findByTestId("pin-cell-0");
  await userEvent.click(first);
  await userEvent.keyboard(pin);
}

beforeAll(async () => {
  await i18n.changeLanguage("ru");
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("route guard", () => {
  it("redirects to /login with a return URL when there is no session", async () => {
    mockApi((url) => (url.pathname === "/api/auth/me" ? unauthorized() : undefined));
    const router = renderApp("/meetings/abc?tab=1");
    expect(await screen.findByTestId("login-page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toBe(
      `?next=${encodeURIComponent("/meetings/abc?tab=1")}`,
    );
  });

  it("any 401 during the session sends the user back to /login", async () => {
    let expired = false;
    mockApi(
      (url) =>
        url.pathname === "/api/auth/me" ? (expired ? unauthorized() : json(ME)) : undefined,
      (url) => {
        if (url.pathname !== "/api/meetings") return undefined;
        expired = true;
        return unauthorized();
      },
    );
    const router = renderApp("/catalog");
    expect(await screen.findByTestId("login-page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("shows the Not found page for unknown URLs", async () => {
    mockApi((url) => (url.pathname === "/api/auth/me" ? json(ME) : undefined));
    renderApp("/nope/at/all");
    expect(await screen.findByTestId("not-found-page")).toBeInTheDocument();
  });
});

describe("login", () => {
  it("six numeric cells, submits automatically on the sixth digit and returns to the original URL", async () => {
    let signedIn = false;
    const spy = mockApi(
      (url) => {
        if (url.pathname === "/api/auth/me") return signedIn ? json(ME) : unauthorized();
      },
      (url, init) => {
        if (url.pathname !== "/api/auth/login") return undefined;
        signedIn = true;
        expect(JSON.parse(String(init?.body))).toEqual({ pin: "123456" });
        return json(ME);
      },
      (url) => (url.pathname === "/api/meetings" ? json({ items: [] }) : undefined),
    );
    const router = renderApp("/login?next=%2Fcatalog");
    for (let i = 0; i < 6; i++) {
      expect(await screen.findByTestId(`pin-cell-${i}`)).toHaveAttribute(
        "inputmode",
        "numeric",
      );
    }
    await typePin("123456");
    await waitFor(() => expect(router.state.location.pathname).toBe("/catalog"));
    expect(
      spy.mock.calls.filter(([u]) => String(u) === "/api/auth/login"),
    ).toHaveLength(1);
  });

  it("shows «Неверный PIN» for a wrong PIN and clears the cells", async () => {
    mockApi(
      (url) => (url.pathname === "/api/auth/me" ? unauthorized() : undefined),
      (url) =>
        url.pathname === "/api/auth/login"
          ? json({ code: "INVALID_PIN", message: "Неверный PIN" }, 401)
          : undefined,
    );
    renderApp("/login");
    await typePin("000000");
    expect(await screen.findByText("Неверный PIN")).toBeInTheDocument();
    expect(screen.getByTestId("pin-cell-0")).toHaveValue("");
    expect(screen.getByTestId("pin-cell-0")).not.toBeDisabled();
  });

  it("423: shows the exact text from the response and disables the field", async () => {
    mockApi(
      (url) => (url.pathname === "/api/auth/me" ? unauthorized() : undefined),
      (url) =>
        url.pathname === "/api/auth/login"
          ? json({ code: "LOGIN_BLOCKED", message: BLOCKED_TEXT }, 423)
          : undefined,
    );
    renderApp("/login");
    await typePin("111111");
    expect(await screen.findByText(BLOCKED_TEXT)).toBeInTheDocument();
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`pin-cell-${i}`)).toBeDisabled();
    }
  });

  it("accepts a pasted PIN and ignores non-digits", async () => {
    const spy = mockApi(
      (url) => (url.pathname === "/api/auth/me" ? unauthorized() : undefined),
      (url) =>
        url.pathname === "/api/auth/login"
          ? json({ code: "INVALID_PIN", message: "Неверный PIN" }, 401)
          : undefined,
    );
    renderApp("/login");
    await userEvent.click(await screen.findByTestId("pin-cell-0"));
    await userEvent.paste("12ab34-56");
    await waitFor(() =>
      expect(
        spy.mock.calls.some(
          ([u, init]) =>
            String(u) === "/api/auth/login" &&
            String(init?.body) === JSON.stringify({ pin: "123456" }),
        ),
      ).toBe(true),
    );
  });

  it("safeNext only allows in-app paths", () => {
    expect(safeNext("/catalog?x=1")).toBe("/catalog?x=1");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("/login")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});

describe("both backend modes (D-20: AUTH_REQUIRED)", () => {
  it("false: /api/auth/me answers 200 without a session → app works, no login screen", async () => {
    mockApi(
      (url) => (url.pathname === "/api/auth/me" ? json(ME) : undefined),
      (url) =>
        url.pathname === "/api/meetings"
          ? json(LISTS[url.searchParams.get("workspace_id") ?? ""])
          : undefined,
    );
    const router = renderApp("/catalog");
    expect(await screen.findByText("personal.mp4")).toBeInTheDocument();
    expect(screen.getByTestId("user-name")).toHaveTextContent("Роман");
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/catalog");
  });

  it("false: after «Выйти» the legacy mode is back (me still 200)", async () => {
    mockApi(
      (url) => (url.pathname === "/api/auth/me" ? json(ME) : undefined),
      (url) =>
        url.pathname === "/api/auth/logout" ? new Response(null, { status: 204 }) : undefined,
      (url) =>
        url.pathname === "/api/meetings"
          ? json(LISTS[url.searchParams.get("workspace_id") ?? ""])
          : undefined,
    );
    renderApp("/catalog");
    await userEvent.click(await screen.findByTestId("logout-button"));
    await waitFor(() => expect(screen.queryByTestId("login-page")).not.toBeInTheDocument());
    expect(await screen.findByText("personal.mp4")).toBeInTheDocument();
  });

  it("true: 401 on /api/auth/me → login screen; after login /api/auth/me is requested again", async () => {
    let signedIn = false;
    const spy = mockApi(
      (url) => {
        if (url.pathname === "/api/auth/me") return signedIn ? json(ME) : unauthorized();
      },
      (url) => {
        if (url.pathname !== "/api/auth/login") return undefined;
        signedIn = true;
        return json(ME);
      },
      (url) => (url.pathname === "/api/meetings" ? json({ items: [] }) : undefined),
    );
    renderApp("/catalog");
    await typePin("123456");
    await screen.findByTestId("catalog-empty");
    const calls = spy.mock.calls.map(([u]) => String(u));
    const loginAt = calls.indexOf("/api/auth/login");
    expect(calls.slice(loginAt + 1)).toContain("/api/auth/me");
  });
});

describe("workspace switcher and user menu", () => {
  function signedInApi() {
    return mockApi(
      (url) => (url.pathname === "/api/auth/me" ? json(ME) : undefined),
      (url) => {
        if (url.pathname !== "/api/meetings") return undefined;
        return json(LISTS[url.searchParams.get("workspace_id") ?? ""]);
      },
    );
  }

  it("lists the user's workspaces, personal first, and shows the user name", async () => {
    signedInApi();
    renderApp("/catalog");
    const select = await screen.findByTestId("workspace-switcher");
    expect(select).toHaveValue(WS_PERSONAL);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Роман (личное)",
      "Команда",
    ]);
    expect(screen.getByTestId("user-name")).toHaveTextContent("Роман");
  });

  it("switching the workspace reloads the task list for it and remembers the choice", async () => {
    const spy = signedInApi();
    renderApp("/catalog");
    expect(await screen.findByText("personal.mp4")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByTestId("workspace-switcher"), WS_SHARED);

    expect(await screen.findByText("team.mp4")).toBeInTheDocument();
    expect(screen.queryByText("personal.mp4")).not.toBeInTheDocument();
    expect(localStorage.getItem("transcrib.workspace")).toBe(WS_SHARED);
    const urls = spy.mock.calls.map(([u]) => String(u));
    expect(urls).toContain(`/api/meetings?workspace_id=${WS_SHARED}`);
  });

  it("starts in the stored workspace when the user still belongs to it", async () => {
    localStorage.setItem("transcrib.workspace", WS_SHARED);
    signedInApi();
    renderApp("/catalog");
    expect(await screen.findByText("team.mp4")).toBeInTheDocument();
  });

  it("falls back to the first workspace when the stored one is gone", async () => {
    localStorage.setItem("transcrib.workspace", "c0000000-0000-4000-8000-0000000000ff");
    signedInApi();
    renderApp("/catalog");
    expect(await screen.findByText("personal.mp4")).toBeInTheDocument();
  });

  it("«Выйти» ends the session and opens the login screen", async () => {
    let signedIn = true;
    const spy = mockApi(
      (url) => {
        if (url.pathname === "/api/auth/me") return signedIn ? json(ME) : unauthorized();
      },
      (url) => {
        if (url.pathname === "/api/auth/logout") {
          signedIn = false;
          return new Response(null, { status: 204 });
        }
      },
      (url) => (url.pathname === "/api/meetings" ? json({ items: [] }) : undefined),
    );
    const router = renderApp("/catalog");
    await userEvent.click(await screen.findByTestId("logout-button"));
    expect(await screen.findByTestId("login-page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(
      spy.mock.calls.some(
        ([u, init]) => String(u) === "/api/auth/logout" && init?.method === "POST",
      ),
    ).toBe(true);
  });

  it("uploads go to the current workspace (workspace_id added to /api/uploads/* bodies)", async () => {
    localStorage.setItem("transcrib.workspace", WS_SHARED);
    const spy = mockApi(
      (url) => (url.pathname === "/api/auth/me" ? json(ME) : undefined),
      (url) => (url.pathname === "/api/meetings" ? json({ items: [] }) : undefined),
      (url) => (url.pathname === "/api/uploads/abort" ? json({}) : undefined),
    );
    renderApp("/catalog");
    await screen.findByTestId("catalog-empty");
    await apiPost("/api/uploads/abort", { s3_key: "k", s3_upload_id: "u" }, { parse: (d) => d });
    const call = spy.mock.calls.find(([u]) => String(u) === "/api/uploads/abort")!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      s3_key: "k",
      s3_upload_id: "u",
      workspace_id: WS_SHARED,
    });
  });
});
