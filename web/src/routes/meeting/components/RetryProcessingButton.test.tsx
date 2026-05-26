/**
 * UC-004-FE — CMP-RetryProcessing tests
 * Test scenarios from test-spec-fe.md: TS-FE-1..TS-FE-6
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import i18n from "@/i18n/config";
import { ToastContextProvider } from "@/lib/use-toast";
import { Toaster } from "@/components/ui/toaster";
import MeetingDetailPage from "../index";

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

const MEETING_ID = "b2c3d4e5-2345-4bcd-9ef0-b2c3d4e5f6a7";

function renderMeetingDetail(id = MEETING_ID) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/meetings/:id", element: <MeetingDetailPage /> },
      { path: "/catalog", element: <div data-testid="catalog-page" /> },
      {
        path: "/meetings/:id/transcript",
        element: <div data-testid="transcript-page" />,
      },
      {
        path: "/meetings/:id/protocol",
        element: <div data-testid="protocol-page" />,
      },
    ],
    { initialEntries: [`/meetings/${id}`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <ToastContextProvider>
        <RouterProvider router={router} />
        <Toaster />
      </ToastContextProvider>
    </QueryClientProvider>,
  );
}

// Base mock for a FAILED meeting
const MOCK_FAILED_DETAIL = {
  meeting: {
    id: MEETING_ID,
    title: "Weekly Sync",
    language: "RU" as const,
    status: "FAILED" as const,
    uploaded_at: "2026-05-18T10:00:00.000Z",
    updated_at: "2026-05-18T11:00:00.000Z",
  },
  recording: {
    filename: "weekly.mp4",
    size_bytes: 10485760,
    mime_type: "VIDEO_MP4" as const,
    duration_sec: 125,
  },
  latest_transcription_job: {
    status: "FAILED" as const,
    started_at: "2026-05-18T10:01:00.000Z",
    completed_at: null,
    error_reason: "ASR service unavailable",
  },
  latest_protocol_job: null,
  transcript_exists: false,
  protocol_exists: false,
};

// Base mock for a non-failed meeting
const MOCK_DONE_DETAIL = {
  ...MOCK_FAILED_DETAIL,
  meeting: {
    ...MOCK_FAILED_DETAIL.meeting,
    status: "PROTOCOL_READY" as const,
  },
  latest_transcription_job: {
    status: "DONE" as const,
    started_at: "2026-05-18T10:01:00.000Z",
    completed_at: "2026-05-18T10:05:00.000Z",
    error_reason: null,
  },
  transcript_exists: true,
  protocol_exists: true,
};

// TS-FE-1 — Action visible only on FAILED (RQ-036, AS01)
describe("TS-FE-1: Retry button visibility", () => {
  it("shows 'Retry processing' button when status is FAILED", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(makeJsonResponse(MOCK_FAILED_DETAIL)),
    );
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-retry")).toBeInTheDocument();
    });
    expect(screen.getByTestId("btn-retry")).toHaveTextContent(
      "Retry processing",
    );
  });

  it("shows error_reason when status is FAILED", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(makeJsonResponse(MOCK_FAILED_DETAIL)),
    );
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("meeting-error_reason")).toBeInTheDocument();
    });
    expect(screen.getByTestId("meeting-error_reason").textContent).toContain(
      "ASR service unavailable",
    );
  });

  it("hides 'Retry processing' button when status is PROTOCOL_READY", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(makeJsonResponse(MOCK_DONE_DETAIL)),
    );
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-delete")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("btn-retry")).not.toBeInTheDocument();
  });

  it("hides 'Retry processing' button when status is TRANSCRIBING", async () => {
    const detail = {
      ...MOCK_FAILED_DETAIL,
      meeting: { ...MOCK_FAILED_DETAIL.meeting, status: "TRANSCRIBING" as const },
      latest_transcription_job: {
        status: "PROCESSING" as const,
        started_at: "2026-05-18T10:01:00.000Z",
        completed_at: null,
        error_reason: null,
      },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(makeJsonResponse(detail)),
    );
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-delete")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("btn-retry")).not.toBeInTheDocument();
  });

  it("hides 'Retry processing' button when status is DONE", async () => {
    const detail = {
      ...MOCK_DONE_DETAIL,
      meeting: { ...MOCK_DONE_DETAIL.meeting, status: "PROTOCOL_READY" as const },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(makeJsonResponse(detail)),
    );
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-delete")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("btn-retry")).not.toBeInTheDocument();
  });
});

// TS-FE-2 — Confirm dialog (AS02)
describe("TS-FE-2: Confirm dialog behaviour", () => {
  it("opens confirm dialog when retry button clicked", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(makeJsonResponse(MOCK_FAILED_DETAIL)),
    );
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-retry")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry"));
    await waitFor(() => {
      expect(screen.getByTestId("retry-confirm-dialog")).toBeInTheDocument();
    });
  });

  it("fires POST /api/meetings/:id/retry on confirm", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      (input, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST") {
          return Promise.resolve(
            makeJsonResponse({
              id: MEETING_ID,
              title: "Weekly Sync",
              status: "TRANSCRIBING",
              language: "RU",
              createdAt: "2026-05-18T10:00:00.000Z",
              updatedAt: "2026-05-18T11:05:00.000Z",
            }),
          );
        }
        return Promise.resolve(makeJsonResponse(MOCK_FAILED_DETAIL));
      },
    );
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-retry")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry"));
    await waitFor(() => {
      expect(screen.getByTestId("retry-confirm-dialog")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry-confirm"));
    await waitFor(() => {
      const postCalls = fetchSpy.mock.calls.filter(
        ([, init]) => (init?.method ?? "GET").toUpperCase() === "POST",
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(1);
      const firstPostCall = postCalls[0];
      expect(firstPostCall).toBeDefined();
      const url = String(firstPostCall![0]);
      expect(url).toContain(`/api/meetings/${MEETING_ID}/retry`);
    });
  });

  it("closes dialog and fires nothing on cancel", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(makeJsonResponse(MOCK_FAILED_DETAIL)),
    );
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-retry")).toBeInTheDocument();
    });
    const callsBefore = fetchSpy.mock.calls.length;
    await userEvent.click(screen.getByTestId("btn-retry"));
    await waitFor(() => {
      expect(screen.getByTestId("retry-confirm-dialog")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry-cancel"));
    await waitFor(() => {
      expect(
        screen.queryByTestId("retry-confirm-dialog"),
      ).not.toBeInTheDocument();
    });
    // No additional POST calls beyond the initial GET
    const postCallsAfter = fetchSpy.mock.calls
      .slice(callsBefore)
      .filter(([, init]) => (init?.method ?? "GET").toUpperCase() === "POST");
    expect(postCallsAfter.length).toBe(0);
  });
});

// TS-FE-3 — Success updates UI
describe("TS-FE-3: Success invalidates meeting query", () => {
  it("after successful retry, invalidates the meeting query (refetch occurs)", async () => {
    let getCallCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        return Promise.resolve(
          makeJsonResponse({
            id: MEETING_ID,
            title: "Weekly Sync",
            status: "TRANSCRIBING",
            language: "RU",
            createdAt: "2026-05-18T10:00:00.000Z",
            updatedAt: "2026-05-18T11:05:00.000Z",
          }),
        );
      }
      getCallCount++;
      // After retry, return TRANSCRIBING state
      if (getCallCount > 1) {
        return Promise.resolve(
          makeJsonResponse({
            ...MOCK_FAILED_DETAIL,
            meeting: {
              ...MOCK_FAILED_DETAIL.meeting,
              status: "TRANSCRIBING" as const,
            },
          }),
        );
      }
      return Promise.resolve(makeJsonResponse(MOCK_FAILED_DETAIL));
    });
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-retry")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry"));
    await waitFor(() => {
      expect(screen.getByTestId("retry-confirm-dialog")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry-confirm"));
    // Query is invalidated and refetch happens — getCallCount becomes > 1
    await waitFor(() => {
      expect(getCallCount).toBeGreaterThan(1);
    });
  });
});

// TS-FE-4 — 409 toast (RQ-036)
describe("TS-FE-4: 409 shows toast, no destructive UI change", () => {
  it("on 409 RETRY_ALREADY_IN_FLIGHT, shows a non-destructive toast", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        return Promise.resolve(
          makeJsonResponse({ code: "RETRY_ALREADY_IN_FLIGHT" }, 409),
        );
      }
      return Promise.resolve(makeJsonResponse(MOCK_FAILED_DETAIL));
    });
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-retry")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry"));
    await waitFor(() => {
      expect(screen.getByTestId("retry-confirm-dialog")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry-confirm"));
    await waitFor(() => {
      // Toast should appear with the conflict title
      expect(screen.getByText("Already in progress")).toBeInTheDocument();
    });
  });

  it("on 409 MEETING_NOT_FAILED, shows a non-destructive toast", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        return Promise.resolve(
          makeJsonResponse({ code: "MEETING_NOT_FAILED" }, 409),
        );
      }
      return Promise.resolve(makeJsonResponse(MOCK_FAILED_DETAIL));
    });
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-retry")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry"));
    await waitFor(() => {
      expect(screen.getByTestId("retry-confirm-dialog")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry-confirm"));
    await waitFor(() => {
      expect(screen.getByText("Already in progress")).toBeInTheDocument();
    });
  });
});

// TS-FE-5 — Double-submit guard (RQ-035)
describe("TS-FE-5: Double-submit guard", () => {
  it("retry button is disabled while mutation is pending", async () => {
    // Use a promise that never resolves to simulate pending state
    let resolveFetch!: (r: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        });
      }
      return Promise.resolve(makeJsonResponse(MOCK_FAILED_DETAIL));
    });
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-retry")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry"));
    await waitFor(() => {
      expect(screen.getByTestId("retry-confirm-dialog")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry-confirm"));
    // The mutation is now in-flight; button should be disabled
    await waitFor(() => {
      expect(screen.getByTestId("btn-retry")).toBeDisabled();
    });
    // Resolve so the test can clean up
    resolveFetch(
      makeJsonResponse({
        id: MEETING_ID,
        title: "Weekly Sync",
        status: "TRANSCRIBING",
        language: "RU",
        createdAt: "2026-05-18T10:00:00.000Z",
        updatedAt: "2026-05-18T11:05:00.000Z",
      }),
    );
  });
});

// TS-FE-6 — i18n
describe("TS-FE-6: i18n labels", () => {
  it("renders retry action label in English", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(makeJsonResponse(MOCK_FAILED_DETAIL)),
    );
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-retry")).toHaveTextContent(
        "Retry processing",
      );
    });
  });

  it("renders retry action label in Russian", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(makeJsonResponse(MOCK_FAILED_DETAIL)),
    );
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-retry")).toHaveTextContent(
        "Повторить обработку",
      );
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  it("renders confirm dialog copy in English", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(makeJsonResponse(MOCK_FAILED_DETAIL)),
    );
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-retry")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-retry"));
    await waitFor(() => {
      expect(screen.getByTestId("retry-confirm-dialog")).toBeInTheDocument();
      expect(screen.getByText("Retry processing?")).toBeInTheDocument();
    });
  });
});
