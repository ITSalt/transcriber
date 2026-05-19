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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FAKE_INIT_RESPONSE = {
  s3_key: "pending/test-uuid.mp4",
  s3_upload_id: "test-multipart-upload-id",
  part_size: 10 * 1024 * 1024,
  parts: [{ part_number: 1, url: "http://localhost:9000/presigned-part-1" }],
};

const FAKE_COMPLETE_RESPONSE = {
  meeting_id: "a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6",
  status: "TRANSCRIBING",
};

function mockSuccessfulUpload() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const urlStr = String(url);
    if (urlStr.includes("/api/uploads/init")) {
      return makeJsonResponse(FAKE_INIT_RESPONSE);
    }
    if ((init as RequestInit | undefined)?.method === "PUT") {
      return new Response("", { status: 200, headers: { ETag: '"test-etag-1"' } });
    }
    if (urlStr.includes("/api/uploads/complete")) {
      return makeJsonResponse(FAKE_COMPLETE_RESPONSE);
    }
    if (urlStr.includes("/api/uploads/abort")) {
      return new Response("", { status: 204 });
    }
    return new Response("Not found", { status: 404 });
  });
}

function mockFetchError(status = 500, message = "Internal error") {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("/api/uploads/init")) {
      return makeJsonResponse({ message }, status);
    }
    return makeJsonResponse({ message }, status);
  });
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
      screen.getByText("Video file (MP4 / MKV / MOV / WEBM, max 1 GB)"),
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

  it("RQ-008: shows error for file > 1 GiB before upload", async () => {
    renderUpload();
    const oversizeFile = makeVideoFile("big.mp4", "video/mp4", 1_073_741_825);
    const input = screen.getByTestId("upload-input-file");
    await userEvent.upload(input, oversizeFile);
    await userEvent.click(screen.getByTestId("upload-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toBeInTheDocument();
      expect(screen.getByTestId("upload-error").textContent).toContain("1 GB");
    });
  });

  it("RQ-009: shows error for unsupported MIME type", async () => {
    renderUpload();
    const badFile = new File([new ArrayBuffer(1024)], "video.xyz", {
      type: "application/octet-stream",
    });
    const input = screen.getByTestId("upload-input-file");
    fireEvent.change(input, { target: { files: [badFile] } });
    await waitFor(() => {
      expect(screen.getByTestId("upload-submit")).not.toBeDisabled();
    });
    await userEvent.click(screen.getByTestId("upload-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("upload-error")).toBeInTheDocument();
      expect(screen.getByTestId("upload-error").textContent).toContain("MP4");
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
    mockSuccessfulUpload();
    renderUpload();
    const file = makeVideoFile("meeting.mp4", "video/mp4", 1024);
    await userEvent.upload(screen.getByTestId("upload-input-file"), file);
    await userEvent.click(screen.getByTestId("upload-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("meeting-detail")).toBeInTheDocument();
    });
  });

  it("SYNC-UC100-1: init POST sends filename, size_bytes, filetype, and title", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/uploads/init")) {
          return makeJsonResponse(FAKE_INIT_RESPONSE);
        }
        if ((init as RequestInit | undefined)?.method === "PUT") {
          return new Response("", { status: 200, headers: { ETag: '"etag"' } });
        }
        if (urlStr.includes("/api/uploads/complete")) {
          return makeJsonResponse(FAKE_COMPLETE_RESPONSE);
        }
        return new Response("", { status: 204 });
      },
    );

    renderUpload();
    const file = makeVideoFile("my-meeting.mp4", "video/mp4", 2048);
    await userEvent.upload(screen.getByTestId("upload-input-file"), file);
    await userEvent.click(screen.getByTestId("upload-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("meeting-detail")).toBeInTheDocument();
    });

    const initCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes("/api/uploads/init"),
    );
    const body = JSON.parse(
      ((initCall?.[1] as RequestInit) ?? {}).body as string,
    ) as Record<string, unknown>;
    expect(body["filename"]).toBe("my-meeting.mp4");
    expect(body["size_bytes"]).toBe(2048);
    expect(body["filetype"]).toBe("video/mp4");
    expect(body["title"]).toBe("my-meeting");
  });

  it("shows error when upload API call fails", async () => {
    mockFetchError(500, "Internal error");
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
      screen.getByText("Видеофайл (MP4 / MKV / MOV / WEBM, макс. 1 ГБ)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Язык (оставьте пустым для автоопределения)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Название встречи (по умолчанию — имя файла)"),
    ).toBeInTheDocument();
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // CRIT-FE-2 regression: auto-detect must send language=null (not "auto")
  it("CRIT-FE-2: auto-detect language sends language=null in init request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/uploads/init")) {
          return makeJsonResponse(FAKE_INIT_RESPONSE);
        }
        if ((init as RequestInit | undefined)?.method === "PUT") {
          return new Response("", { status: 200, headers: { ETag: '"etag"' } });
        }
        if (urlStr.includes("/api/uploads/complete")) {
          return makeJsonResponse(FAKE_COMPLETE_RESPONSE);
        }
        return new Response("", { status: 204 });
      },
    );

    renderUpload();
    const file = makeVideoFile("meeting.mp4", "video/mp4", 1024);
    await userEvent.upload(screen.getByTestId("upload-input-file"), file);
    // Do not select any language (leave as auto-detect / blank)
    await userEvent.click(screen.getByTestId("upload-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("meeting-detail")).toBeInTheDocument();
    });

    const initCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes("/api/uploads/init"),
    );
    const body = JSON.parse(
      ((initCall?.[1] as RequestInit) ?? {}).body as string,
    ) as Record<string, unknown>;
    expect(body["language"]).toBeNull();
  });

  // CRIT-FE-1: video/webm is now an accepted format (browser meeting recordings
  // arrive as WebM by default). The original RQ-009 whitelist did not include
  // it; we extended the whitelist after seeing real .webm uploads bounce.
  it("CRIT-FE-1: accepts video/webm file without MIME error", async () => {
    renderUpload();
    const webmFile = new File([new ArrayBuffer(1024)], "video.webm", {
      type: "video/webm",
    });
    const input = screen.getByTestId("upload-input-file");
    fireEvent.change(input, { target: { files: [webmFile] } });
    await waitFor(() => {
      expect(screen.getByTestId("upload-submit")).not.toBeDisabled();
    });
    expect(screen.queryByTestId("upload-error")).not.toBeInTheDocument();
  });

  // CRIT-FE-3: init request body must contain filename, filetype (MIME string), size_bytes, title
  it("CRIT-FE-3: init request body contains filename, filetype (MIME string), size_bytes, and title", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/uploads/init")) {
          return makeJsonResponse(FAKE_INIT_RESPONSE);
        }
        if ((init as RequestInit | undefined)?.method === "PUT") {
          return new Response("", { status: 200, headers: { ETag: '"etag"' } });
        }
        if (urlStr.includes("/api/uploads/complete")) {
          return makeJsonResponse(FAKE_COMPLETE_RESPONSE);
        }
        return new Response("", { status: 204 });
      },
    );

    renderUpload();
    const file = makeVideoFile("my-meeting.mp4", "video/mp4", 2048);
    await userEvent.upload(screen.getByTestId("upload-input-file"), file);
    await userEvent.click(screen.getByTestId("upload-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("meeting-detail")).toBeInTheDocument();
    });

    const initCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes("/api/uploads/init"),
    );
    const body = JSON.parse(
      ((initCall?.[1] as RequestInit) ?? {}).body as string,
    ) as Record<string, unknown>;
    expect(body["filename"]).toBe("my-meeting.mp4");
    expect(body["filetype"]).toBe("video/mp4");
    expect(body["size_bytes"]).toBe(2048);
    expect(body["title"]).toBe("my-meeting");
  });
});
