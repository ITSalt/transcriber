import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import i18n from "@/i18n/config";
import { json, mockApi, WithSession, WS_PERSONAL } from "@/lib/test-utils";
import CatalogPage from "./index";

// i18n must be initialised before rendering; lock to English for predictable assertions
beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderCatalog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/", element: <CatalogPage /> },
      { path: "/meetings/:id", element: <div data-testid="meeting-detail" /> },
      { path: "/meetings/:id/protocol", element: <div data-testid="protocol-page" /> },
      { path: "/upload", element: <div data-testid="upload-page" /> },
    ],
    { initialEntries: ["/"] },
  );
  return render(
    <QueryClientProvider client={client}>
      <WithSession>
        <RouterProvider router={router} />
      </WithSession>
    </QueryClientProvider>,
  );
}

/** Answers GET /api/meetings with `body` and records the requested URLs. */
function mockList(body: unknown, status = 200) {
  return mockApi((url) =>
    url.pathname === "/api/meetings" ? json(body, status) : undefined,
  );
}

const MEETING_ID_1 = "a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6";
const MEETING_ID_2 = "b2c3d4e5-5678-4bcd-9ef0-b2c3d4e5f6a7";

const base = {
  workspace_id: WS_PERSONAL,
  project_id: null,
  project_name: null,
  language: "RU" as const,
  updated_at: "2026-05-18T11:00:00.000Z",
  duration_sec: 125,
};

const MOCK_MEETINGS = {
  items: [
    {
      ...base,
      id: MEETING_ID_1,
      title: "Weekly Sync",
      filename: "weekly.mp4",
      status: "PROTOCOL_READY" as const,
      uploaded_at: "2026-05-18T10:00:00.000Z",
    },
    {
      ...base,
      id: MEETING_ID_2,
      title: null,
      filename: "interview.mp4",
      status: "TRANSCRIBING" as const,
      uploaded_at: "2026-05-18T09:00:00.000Z",
    },
  ],
};

describe("CatalogPage (Tasks)", () => {
  it("renders the page container titled Tasks", () => {
    mockList({ items: [] });
    renderCatalog();
    expect(screen.getByTestId("catalog-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
  });

  it("shows loading state while fetching", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    renderCatalog();
    expect(screen.getByTestId("catalog-loading")).toBeInTheDocument();
  });

  it("requests only the current workspace", async () => {
    const spy = mockList({ items: [] });
    renderCatalog();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(String(spy.mock.calls[0]![0])).toBe(
      `/api/meetings?workspace_id=${WS_PERSONAL}`,
    );
  });

  it("shows empty state when there are no tasks", async () => {
    mockList({ items: [] });
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByTestId("catalog-empty")).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    mockList({ message: "Server Error" }, 500);
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByTestId("catalog-error")).toBeInTheDocument();
    });
  });

  it("renders the File, Date, Status and Protocol columns", async () => {
    mockList(MOCK_MEETINGS);
    renderCatalog();
    for (const name of ["File", "Date", "Status", "Protocol"]) {
      expect(
        await screen.findByRole("columnheader", { name }),
      ).toBeInTheDocument();
    }
  });

  it("renders a row per task showing the file name", async () => {
    mockList(MOCK_MEETINGS);
    renderCatalog();
    expect(await screen.findByText("weekly.mp4")).toBeInTheDocument();
    expect(screen.getByText("interview.mp4")).toBeInTheDocument();
    expect(screen.getByTestId(`meeting-row-${MEETING_ID_1}`)).toBeInTheDocument();
    expect(screen.getByTestId(`meeting-row-${MEETING_ID_2}`)).toBeInTheDocument();
  });

  it("links to the protocol only when it exists", async () => {
    mockList(MOCK_MEETINGS);
    renderCatalog();
    const link = await screen.findByTestId(`protocol-link-${MEETING_ID_1}`);
    expect(link).toHaveAttribute("href", `/meetings/${MEETING_ID_1}/protocol`);
    expect(
      screen.queryByTestId(`protocol-link-${MEETING_ID_2}`),
    ).not.toBeInTheDocument();
  });

  it("renders status badges for each task", async () => {
    mockList(MOCK_MEETINGS);
    renderCatalog();
    expect(await screen.findByTestId("status-badge-PROTOCOL_READY")).toBeInTheDocument();
    expect(screen.getByTestId("status-badge-TRANSCRIBING")).toBeInTheDocument();
  });

  it("a11y — table has an accessible name", async () => {
    mockList(MOCK_MEETINGS);
    renderCatalog();
    expect(
      await screen.findByRole("table", { name: /task list/i }),
    ).toBeInTheDocument();
  });

  it("a11y — status badge container has aria-live='polite'", async () => {
    mockList(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(document.querySelectorAll("[aria-live='polite']").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("navigates to /meetings/:id when Open is clicked", async () => {
    mockList(MOCK_MEETINGS);
    renderCatalog();
    await userEvent.click(await screen.findByTestId(`open-meeting-${MEETING_ID_1}`));
    await waitFor(() => {
      expect(screen.getByTestId("meeting-detail")).toBeInTheDocument();
    });
  });

  it("upload button links to /upload", async () => {
    mockList(MOCK_MEETINGS);
    renderCatalog();
    await screen.findByText("weekly.mp4");
    expect(screen.getByTestId("upload-button").closest("a")).toHaveAttribute(
      "href",
      "/upload",
    );
  });

  it("upload button is visible in empty state", async () => {
    mockList({ items: [] });
    renderCatalog();
    await screen.findByTestId("catalog-empty");
    expect(screen.getByTestId("upload-button").closest("a")).toHaveAttribute(
      "href",
      "/upload",
    );
  });
});
