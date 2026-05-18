import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import i18n from "@/i18n/config";
import CatalogPage from "./index";

// i18n must be initialised before rendering; lock to English for predictable assertions
beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Return a fresh Response on every call so the body stream is never reused. */
function mockFetch(body: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(makeJsonResponse(body, status)),
  );
}

function renderCatalog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/", element: <CatalogPage /> },
      { path: "/meetings/:id", element: <div data-testid="meeting-detail" /> },
    ],
    { initialEntries: ["/"] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

// Use valid v4 UUIDs — Zod v4 validates uuid format strictly
const MEETING_ID_1 = "a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6";
const MEETING_ID_2 = "b2c3d4e5-5678-4bcd-9ef0-b2c3d4e5f6a7";

const MOCK_MEETINGS = {
  items: [
    {
      id: MEETING_ID_1,
      title: "Weekly Sync",
      filename: "weekly.mp4",
      status: "PROTOCOL_READY" as const,
      language: "RU" as const,
      uploaded_at: "2026-05-18T10:00:00.000Z",
      updated_at: "2026-05-18T11:00:00.000Z",
      duration_sec: 125,
    },
    {
      id: MEETING_ID_2,
      title: null,
      filename: "interview.mp4",
      status: "TRANSCRIBING" as const,
      language: null,
      uploaded_at: "2026-05-18T09:00:00.000Z",
      updated_at: "2026-05-18T09:30:00.000Z",
      duration_sec: null,
    },
  ],
};

describe("CatalogPage", () => {
  it("renders the catalog page container", () => {
    mockFetch({ items: [] });
    renderCatalog();
    expect(screen.getByTestId("catalog-page")).toBeInTheDocument();
  });

  it("shows loading state while fetching", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    renderCatalog();
    expect(screen.getByTestId("catalog-loading")).toBeInTheDocument();
  });

  it("shows empty state when no meetings returned", async () => {
    mockFetch({ items: [] });
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByTestId("catalog-empty")).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    mockFetch({ message: "Server Error" }, 500);
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByTestId("catalog-error")).toBeInTheDocument();
    });
  });

  it("CT01 — Title column header is rendered", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByText("Title")).toBeInTheDocument();
    });
  });

  it("CT02 — Status column header is rendered", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByText("Status")).toBeInTheDocument();
    });
  });

  it("CT03 — Language column header is rendered", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByText("Language")).toBeInTheDocument();
    });
  });

  it("CT04 — Uploaded column header is rendered", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByText("Uploaded")).toBeInTheDocument();
    });
  });

  it("CT05 — Duration column header is rendered", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByText("Duration")).toBeInTheDocument();
    });
  });

  it("renders meeting rows for each item returned", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(
        screen.getByTestId(
          "meeting-row-a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(
          "meeting-row-b2c3d4e5-5678-4bcd-9ef0-b2c3d4e5f6a7",
        ),
      ).toBeInTheDocument();
    });
  });

  it("uses filename as fallback when title is null", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByText("interview.mp4")).toBeInTheDocument();
    });
  });

  it("shows title when present", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByText("Weekly Sync")).toBeInTheDocument();
    });
  });

  it("renders formatted duration (2:05) for meetings with duration_sec=125", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(screen.getByText("2:05")).toBeInTheDocument();
    });
  });

  it("renders em-dash for missing duration", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      // At least one "—" should appear (missing language AND missing duration on second row)
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders status badges for each meeting", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(
        screen.getByTestId("status-badge-PROTOCOL_READY"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("status-badge-TRANSCRIBING"),
      ).toBeInTheDocument();
    });
  });

  it("a11y — table has aria-label 'Meeting catalog'", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(
        screen.getByRole("table", { name: /meeting catalog/i }),
      ).toBeInTheDocument();
    });
  });

  it("a11y — status badge container has aria-live='polite'", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      const liveRegions = document.querySelectorAll("[aria-live='polite']");
      expect(liveRegions.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("navigates to /meetings/:id when Open is clicked", async () => {
    mockFetch(MOCK_MEETINGS);
    renderCatalog();
    await waitFor(() => {
      expect(
        screen.getByTestId(
          "open-meeting-a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6",
        ),
      ).toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByTestId(
        "open-meeting-a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6",
      ),
    );
    await waitFor(() => {
      expect(screen.getByTestId("meeting-detail")).toBeInTheDocument();
    });
  });

  it("upload button is visible in catalog header", async () => {
    mockFetch(MOCK_MEETINGS);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(
      [
        { path: "/", element: <CatalogPage /> },
        { path: "/meetings/:id", element: <div data-testid="meeting-detail" /> },
        { path: "/upload", element: <div data-testid="upload-page" /> },
      ],
      { initialEntries: ["/"] },
    );
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText("Weekly Sync")).toBeInTheDocument();
    });
    const link = screen.getByTestId("upload-button");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/upload");
  });

  it("upload button is visible in empty state", async () => {
    mockFetch({ items: [] });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(
      [
        { path: "/", element: <CatalogPage /> },
        { path: "/meetings/:id", element: <div data-testid="meeting-detail" /> },
        { path: "/upload", element: <div data-testid="upload-page" /> },
      ],
      { initialEntries: ["/"] },
    );
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("catalog-empty")).toBeInTheDocument();
    });
    const link = screen.getByTestId("upload-button");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/upload");
  });
});
