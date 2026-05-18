import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import i18n from "@/i18n/config";
import UploadPage from "./index";

// ─── i18n setup ──────────────────────────────────────────────────────────────
beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── tus-js-client mock ───────────────────────────────────────────────────────
vi.mock("tus-js-client", async () => {
  const actual = await vi.importActual<typeof import("tus-js-client")>(
    "tus-js-client",
  );

  class MockUpload {
    private options: {
      onProgress?: (uploaded: number, total: number) => void;
      onError?: (err: Error) => void;
      onSuccess?: () => void;
    };
    url: string | null = null;
    file: File;

    constructor(
      file: File,
      options: {
        onProgress?: (uploaded: number, total: number) => void;
        onError?: (err: Error) => void;
        onSuccess?: () => void;
        [key: string]: unknown;
      },
    ) {
      this.file = file;
      this.options = options;
    }

    start() {
      // Simulate successful upload by default
      const impl = (MockUpload as unknown as { __impl?: string }).__impl;
      if (impl === "error") {
        this.options.onError?.(new Error("Upload failed"));
      } else {
        this.url = "http://localhost/api/uploads/test-upload-id";
        // Simulate progress
        this.options.onProgress?.(50, 100);
        this.options.onProgress?.(100, 100);
        this.options.onSuccess?.();
      }
    }

    abort() {}
  }

  return {
    ...actual,
    Upload: MockUpload,
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function renderUpload() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/upload", element: <UploadPage /> },
      {
        path: "/meetings/:id",
        element: <div data-testid="meeting-detail" />,
      },
    ],
    { initialEntries: ["/upload"] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function makeVideoFile(
  name = "test.mp4",
  type = "video/mp4",
  sizeBytes = 1024,
) {
  return new File([new ArrayBuffer(sizeBytes)], name, { type });
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("UploadPage", () => {
  it("renders the upload page container", () => {
    renderUpload();
    expect(screen.getByTestId("upload-page")).toBeInTheDocument();
  });

  // CT01 — file field
  it("CT01: renders file field with correct label", () => {
    renderUpload();
    expect(
      screen.getByText("Video file (MP4 / MKV / MOV, max 500 MB)"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("upload-input-file")).toBeInTheDocument();
  });

  // CT02 — language field
  it("CT02: renders language field with correct label", () => {
    renderUpload();
    expect(
      screen.getByText("Language (leave blank for auto-detect)"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("upload-select-language")).toBeInTheDocument();
  });

  // CT03 — title field
  it("CT03: renders title field with correct label", () => {
    renderUpload();
    expect(
      screen.getByText("Meeting title (defaults to filename)"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("upload-input-title")).toBeInTheDocument();
  });

  it("renders Upload and Cancel buttons", () => {
    renderUpload();
    expect(screen.getByTestId("upload-submit")).toBeInTheDocument();
    expect(screen.getByTestId("upload-cancel")).toBeInTheDocument();
  });

  it("Upload button is disabled when no file is selected", () => {
    renderUpload();
    expect(screen.getByTestId("upload-submit")).toBeDisabled();
  });

  it("RQ-008: shows error for file > 500MB before upload", async () => {
    renderUpload();
    const oversizeFile = makeVideoFile("big.mp4", "video/mp4", 524_288_001);
    const input = screen.getByTestId("upload-input-file");
    await userEvent.upload(input, oversizeFile);
    await userEvent.click(screen.getByTestId("upload-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toBeInTheDocument();
      expect(screen.getByTestId("upload-error").textContent).toContain(
        "500 MB",
      );
    });
  });

  it("RQ-009: shows error for unsupported MIME type", async () => {
    renderUpload();
    // Create a file with a clearly unsupported MIME type
    const badFile = new File([new ArrayBuffer(1024)], "video.xyz", {
      type: "application/octet-stream",
    });
    const input = screen.getByTestId("upload-input-file");
    // Use fireEvent to bypass userEvent's accept-attribute filtering in jsdom
    fireEvent.change(input, { target: { files: [badFile] } });
    // Submit button should now be enabled
    await waitFor(() => {
      expect(screen.getByTestId("upload-submit")).not.toBeDisabled();
    });
    await userEvent.click(screen.getByTestId("upload-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toBeInTheDocument();
      expect(screen.getByTestId("upload-error").textContent).toContain(
        "MP4",
      );
    });
  });

  it("defaults title input to filename (without extension) when file is chosen", async () => {
    renderUpload();
    const file = makeVideoFile("my-meeting.mp4", "video/mp4", 1024);
    const input = screen.getByTestId("upload-input-file");
    await userEvent.upload(input, file);
    expect(
      (screen.getByTestId("upload-input-title") as HTMLInputElement).value,
    ).toBe("my-meeting");
  });

  it("enables Upload button after file is selected", async () => {
    renderUpload();
    const file = makeVideoFile("test.mp4", "video/mp4", 1024);
    const input = screen.getByTestId("upload-input-file");
    await userEvent.upload(input, file);
    expect(screen.getByTestId("upload-submit")).not.toBeDisabled();
  });

  it("navigates to /meetings/:id on successful upload", async () => {
    mockFetch(
      {
        meeting_id: "a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6",
        status: "TRANSCRIBING",
      },
      200,
    );
    renderUpload();
    const file = makeVideoFile("meeting.mp4", "video/mp4", 1024);
    await userEvent.upload(screen.getByTestId("upload-input-file"), file);
    await userEvent.click(screen.getByTestId("upload-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("meeting-detail")).toBeInTheDocument();
    });
  });

  it("shows error when finalize API call fails", async () => {
    mockFetch({ message: "Internal error" }, 500);
    renderUpload();
    const file = makeVideoFile("meeting.mp4", "video/mp4", 1024);
    await userEvent.upload(screen.getByTestId("upload-input-file"), file);
    await userEvent.click(screen.getByTestId("upload-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toBeInTheDocument();
    });
  });

  it("renders i18n labels in Russian when language is RU", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    renderUpload();
    expect(
      screen.getByText("Видеофайл (MP4 / MKV / MOV, макс. 500 МБ)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Язык (оставьте пустым для автоопределения)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Название встречи (по умолчанию — имя файла)"),
    ).toBeInTheDocument();
    // reset to en for other tests
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });
});
