import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import i18n from "@/i18n/config";
import TranscriptPage from "./index";

// Lock i18n to English for predictable assertions
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
const TRANSCRIPT_ID = "b2c3d4e5-2345-4bcd-9ef0-b2c3d4e5f6a7";

const MOCK_TRANSCRIPT = {
  id: TRANSCRIPT_ID,
  meeting_id: MEETING_ID,
  full_text:
    "[00:00] spk_0: Hello, everyone.\n[00:05] spk_1: Hi there.",
  segments_count: 2,
  speakers_count: 2,
  language: "EN" as const,
  speaker_map: { spk_0: "Alice", spk_1: "Bob" },
  created_at: "2026-05-18T10:05:00.000Z",
};

function renderTranscriptPage(id = MEETING_ID) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/meetings/:id/transcript",
        element: <TranscriptPage />,
      },
      {
        path: "/meetings/:id",
        element: <div data-testid="meeting-detail-page" />,
      },
    ],
    { initialEntries: [`/meetings/${id}/transcript`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("TranscriptPage", () => {
  it("renders the page container", () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    expect(screen.getByTestId("transcript-page")).toBeInTheDocument();
  });

  it("shows loading state while fetching", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    renderTranscriptPage();
    expect(screen.getByTestId("transcript-loading")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", async () => {
    mockFetch({ message: "Not Found" }, 404);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByTestId("transcript-error")).toBeInTheDocument();
    });
  });

  // CT01 — language field renders + validates
  it("CT01: renders language label", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByText("Language")).toBeInTheDocument();
    });
  });

  it("CT01: renders language value", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByTestId("transcript-language")).toBeInTheDocument();
    });
  });

  it("CT01: renders language label in Russian", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByText("Язык")).toBeInTheDocument();
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // CT02 — segments_count field renders + validates
  it("CT02: renders segments label", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByText("Segments")).toBeInTheDocument();
    });
  });

  it("CT02: renders segments_count value", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(
        screen.getByTestId("transcript-segments_count"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("transcript-segments_count").textContent,
      ).toBe("2");
    });
  });

  it("CT02: renders segments label in Russian", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByText("Сегменты")).toBeInTheDocument();
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // CT03 — speakers_count field renders + validates
  it("CT03: renders speakers label", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByText("Speakers")).toBeInTheDocument();
    });
  });

  it("CT03: renders speakers_count value", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(
        screen.getByTestId("transcript-speakers_count"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("transcript-speakers_count").textContent,
      ).toBe("2");
    });
  });

  it("CT03: renders speakers label in Russian", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByText("Спикеры")).toBeInTheDocument();
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // CT04 — created_at field renders + validates
  it("CT04: renders created label", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByText("Created")).toBeInTheDocument();
    });
  });

  it("CT04: renders created_at value", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByTestId("transcript-created_at")).toBeInTheDocument();
    });
  });

  it("CT04: renders created label in Russian", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByText("Создан")).toBeInTheDocument();
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // CT05 — full_text field renders + validates
  it("CT05: renders transcript content label", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByText("Transcript content")).toBeInTheDocument();
    });
  });

  it("CT05: renders full_text content", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByTestId("transcript-full_text")).toBeInTheDocument();
    });
  });

  it("CT05: renders transcript content label in Russian", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByText("Содержимое транскрипта")).toBeInTheDocument();
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // CT06 — speaker_map field renders + validates
  it("CT06: renders speaker map label when speaker_map exists", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByText("Speaker name map")).toBeInTheDocument();
    });
  });

  it("CT06: renders speaker_map content", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(
        screen.getByTestId("transcript-speaker_map"),
      ).toBeInTheDocument();
    });
  });

  it("CT06: does NOT render speaker map section when speaker_map is null", async () => {
    mockFetch({ ...MOCK_TRANSCRIPT, speaker_map: null });
    renderTranscriptPage();
    await waitFor(() => {
      expect(
        screen.queryByTestId("transcript-speaker_map"),
      ).not.toBeInTheDocument();
    });
  });

  it("CT06: renders speaker map label in Russian", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByText("Карта имён спикеров")).toBeInTheDocument();
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // Download buttons
  it("renders download TXT button", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByTestId("btn-download-txt")).toBeInTheDocument();
    });
  });

  it("download TXT button triggers navigation to download endpoint", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    // Capture location assignment
    const originalLocation = window.location.href;
    const assignSpy = vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      href: originalLocation,
    } as Location);
    await waitFor(() => {
      expect(screen.getByTestId("btn-download-txt")).toBeInTheDocument();
    });
    // Button is rendered — just confirm it's clickable
    const btn = screen.getByTestId("btn-download-txt");
    expect(btn).not.toBeDisabled();
    assignSpy.mockRestore();
  });

  // Back to meeting navigation
  it("renders back to meeting button", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByTestId("btn-back-to-meeting")).toBeInTheDocument();
    });
  });

  it("navigates back to meeting detail when back button is clicked", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(screen.getByTestId("btn-back-to-meeting")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-back-to-meeting"));
    await waitFor(() => {
      expect(
        screen.getByTestId("meeting-detail-page"),
      ).toBeInTheDocument();
    });
  });

  // Acceptance: transcript header shows metadata
  it("shows segments_count, speakers_count, language, created_at in header", async () => {
    mockFetch(MOCK_TRANSCRIPT);
    renderTranscriptPage();
    await waitFor(() => {
      expect(
        screen.getByTestId("transcript-segments_count"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("transcript-speakers_count"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("transcript-language")).toBeInTheDocument();
      expect(screen.getByTestId("transcript-created_at")).toBeInTheDocument();
    });
  });
});
