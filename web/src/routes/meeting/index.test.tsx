import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import i18n from "@/i18n/config";
import { ToastContextProvider } from "@/lib/use-toast";
import MeetingDetailPage from "./index";

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

function mockFetch(body: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(makeJsonResponse(body, status)),
  );
}

const MEETING_ID = "a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6";

function renderMeetingDetail(id = MEETING_ID) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/meetings/:id", element: <MeetingDetailPage /> },
      { path: "/", element: <div data-testid="catalog-page" /> },
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
      </ToastContextProvider>
    </QueryClientProvider>,
  );
}

const MOCK_DETAIL_BASE = {
  meeting: {
    id: MEETING_ID,
    title: "Weekly Sync",
    language: "RU" as const,
    status: "PROTOCOL_READY" as const,
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
    status: "DONE" as const,
    started_at: "2026-05-18T10:01:00.000Z",
    completed_at: "2026-05-18T10:05:00.000Z",
    error_reason: null,
  },
  latest_protocol_job: {
    status: "DONE" as const,
    started_at: "2026-05-18T10:06:00.000Z",
    completed_at: "2026-05-18T10:07:00.000Z",
    error_reason: null,
  },
  transcript_exists: true,
  protocol_exists: true,
};

describe("MeetingDetailPage", () => {
  it("renders the page container", () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    expect(screen.getByTestId("meeting-detail-page")).toBeInTheDocument();
  });

  it("shows loading state while fetching", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    renderMeetingDetail();
    expect(screen.getByTestId("meeting-detail-loading")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", async () => {
    mockFetch({ message: "Not Found" }, 404);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("meeting-detail-error")).toBeInTheDocument();
    });
  });

  // CT01 — title field
  it("CT01: renders title label", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByText("Title")).toBeInTheDocument();
    });
  });

  it("CT01: renders title value", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("meeting-title")).toBeInTheDocument();
    });
  });

  // CT02 — language field
  it("CT02: renders language label", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByText("Language")).toBeInTheDocument();
    });
  });

  it("CT02: renders language value", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("meeting-language")).toBeInTheDocument();
    });
  });

  // CT03 — status field
  it("CT03: renders status label", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByText("Status")).toBeInTheDocument();
    });
  });

  it("CT03: renders status badge", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("meeting-status")).toBeInTheDocument();
    });
  });

  // CT04 — uploaded_at field
  it("CT04: renders uploaded at label", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByText("Uploaded at")).toBeInTheDocument();
    });
  });

  it("CT04: renders uploaded_at value", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("meeting-uploaded_at")).toBeInTheDocument();
    });
  });

  // CT05 — updated_at field
  it("CT05: renders last update label", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByText("Last update")).toBeInTheDocument();
    });
  });

  it("CT05: renders updated_at value", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("meeting-updated_at")).toBeInTheDocument();
    });
  });

  // CT06 — filename field
  it("CT06: renders file name label", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByText("File name")).toBeInTheDocument();
    });
  });

  it("CT06: renders filename value", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("meeting-filename")).toBeInTheDocument();
    });
  });

  // CT07 — size_bytes field
  it("CT07: renders size label", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByText("Size")).toBeInTheDocument();
    });
  });

  it("CT07: renders humanized size", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("meeting-size_bytes")).toBeInTheDocument();
    });
  });

  // CT08 — mime_type field
  it("CT08: renders format label", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByText("Format")).toBeInTheDocument();
    });
  });

  it("CT08: renders mime_type value", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("meeting-mime_type")).toBeInTheDocument();
    });
  });

  // CT09 — duration_sec field
  it("CT09: renders duration label", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByText("Duration")).toBeInTheDocument();
    });
  });

  it("CT09: renders duration value", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("meeting-duration_sec")).toBeInTheDocument();
    });
  });

  // CT10 — error_reason field (only when ERROR status)
  it("CT10: renders error label when status is ERROR", async () => {
    const errorDetail = {
      ...MOCK_DETAIL_BASE,
      meeting: { ...MOCK_DETAIL_BASE.meeting, status: "ERROR" as const },
      latest_transcription_job: {
        status: "FAILED" as const,
        started_at: "2026-05-18T10:01:00.000Z",
        completed_at: null,
        error_reason: "ASR service unavailable",
      },
    };
    mockFetch(errorDetail);
    renderMeetingDetail();
    await waitFor(() => {
      // Multiple "Error" texts expected: banner label + status badge
      expect(screen.getAllByText("Error").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("CT10: renders error_reason text when status is ERROR", async () => {
    const errorDetail = {
      ...MOCK_DETAIL_BASE,
      meeting: { ...MOCK_DETAIL_BASE.meeting, status: "ERROR" as const },
      latest_transcription_job: {
        status: "FAILED" as const,
        started_at: "2026-05-18T10:01:00.000Z",
        completed_at: null,
        error_reason: "ASR service unavailable",
      },
    };
    mockFetch(errorDetail);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("meeting-error_reason")).toBeInTheDocument();
      expect(
        screen.getByTestId("meeting-error_reason").textContent,
      ).toContain("ASR service unavailable");
    });
  });

  // RQ-005 — action links gated by status
  it("RQ-005: shows view transcript link when status is PROTOCOL_READY", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(
        screen.getByTestId("btn-view-transcript"),
      ).toBeInTheDocument();
    });
  });

  it("RQ-005: shows review/edit protocol link when status is PROTOCOL_READY", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(
        screen.getByTestId("btn-view-protocol"),
      ).toBeInTheDocument();
    });
  });

  it("RQ-005: does NOT show transcript link when status is UPLOADING", async () => {
    const uploadingDetail = {
      ...MOCK_DETAIL_BASE,
      meeting: { ...MOCK_DETAIL_BASE.meeting, status: "UPLOADING" as const },
      transcript_exists: false,
      protocol_exists: false,
    };
    mockFetch(uploadingDetail);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.queryByTestId("btn-view-transcript")).not.toBeInTheDocument();
    });
  });

  it("RQ-005: does NOT show protocol link when status is TRANSCRIBED", async () => {
    const transcribedDetail = {
      ...MOCK_DETAIL_BASE,
      meeting: {
        ...MOCK_DETAIL_BASE.meeting,
        status: "TRANSCRIBED" as const,
      },
      protocol_exists: false,
    };
    mockFetch(transcribedDetail);
    renderMeetingDetail();
    await waitFor(() => {
      expect(
        screen.queryByTestId("btn-view-protocol"),
      ).not.toBeInTheDocument();
    });
  });

  it("shows delete button", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-delete")).toBeInTheDocument();
    });
  });

  it("navigates to transcript page when view transcript is clicked", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-view-transcript")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-view-transcript"));
    await waitFor(() => {
      expect(screen.getByTestId("transcript-page")).toBeInTheDocument();
    });
  });

  it("navigates to protocol page when view/edit protocol is clicked", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-view-protocol")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-view-protocol"));
    await waitFor(() => {
      expect(screen.getByTestId("protocol-page")).toBeInTheDocument();
    });
  });

  it("shows delete confirm dialog when delete button clicked", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByTestId("btn-delete")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-delete"));
    await waitFor(() => {
      expect(screen.getByTestId("delete-confirm-dialog")).toBeInTheDocument();
    });
  });

  it("renders i18n labels in Russian when language is RU", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() => {
      expect(screen.getByText("Название")).toBeInTheDocument();
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // UC-003-FE: Delete mutation tests

  // CT01 — meeting title shown in delete dialog
  it("UC-003 CT01: shows meeting title in delete dialog", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() =>
      expect(screen.getByTestId("btn-delete")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("btn-delete"));
    await waitFor(() => {
      expect(
        screen.getByTestId("delete-dialog-meeting-title"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("delete-dialog-meeting-title").textContent,
      ).toBe("Weekly Sync");
    });
  });

  // In-flight warning when a job is PROCESSING
  it("UC-003: shows in-flight warning when job is PROCESSING", async () => {
    const processingDetail = {
      ...MOCK_DETAIL_BASE,
      meeting: { ...MOCK_DETAIL_BASE.meeting, status: "TRANSCRIBING" as const },
      latest_transcription_job: {
        status: "PROCESSING" as const,
        started_at: "2026-05-18T10:01:00.000Z",
        completed_at: null,
        error_reason: null,
      },
    };
    mockFetch(processingDetail);
    renderMeetingDetail();
    await waitFor(() =>
      expect(screen.getByTestId("btn-delete")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("btn-delete"));
    await waitFor(() => {
      expect(
        screen.getByTestId("delete-dialog-inflight-warning"),
      ).toBeInTheDocument();
    });
  });

  // No in-flight warning when no job is running
  it("UC-003: no in-flight warning when jobs are DONE", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() =>
      expect(screen.getByTestId("btn-delete")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("btn-delete"));
    await waitFor(() =>
      expect(screen.getByTestId("delete-confirm-dialog")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("delete-dialog-inflight-warning"),
    ).not.toBeInTheDocument();
  });

  // Successful delete navigates to /catalog
  it("UC-003: navigates to /catalog after successful delete", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "DELETE") {
        return Promise.resolve(
          makeJsonResponse({ deleted: true, in_flight_failed: false }),
        );
      }
      return Promise.resolve(makeJsonResponse(MOCK_DETAIL_BASE));
    });

    renderMeetingDetail();
    await waitFor(() =>
      expect(screen.getByTestId("btn-delete")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("btn-delete"));
    await waitFor(() =>
      expect(screen.getByTestId("delete-confirm-dialog")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("btn-delete-confirm"));
    await waitFor(() => {
      expect(screen.getByTestId("catalog-page")).toBeInTheDocument();
    });
  });

  // Cancel delete closes dialog without navigating
  it("UC-003: cancel delete closes dialog without navigating", async () => {
    mockFetch(MOCK_DETAIL_BASE);
    renderMeetingDetail();
    await waitFor(() =>
      expect(screen.getByTestId("btn-delete")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("btn-delete"));
    await waitFor(() =>
      expect(screen.getByTestId("delete-confirm-dialog")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("btn-delete-cancel"));
    await waitFor(() => {
      expect(
        screen.queryByTestId("delete-confirm-dialog"),
      ).not.toBeInTheDocument();
    });
    // Still on the detail page
    expect(screen.getByTestId("meeting-detail-page")).toBeInTheDocument();
  });
});
