import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  DOCX_MIME,
  FEEDBACK_FILE_MAX_BYTES,
  FeedbackCreateResponse,
  FeedbackListResponse,
  ProtocolVersionListResponse,
  ProtocolVersionResponse,
} from "@transcrib/shared";
import i18n from "@/i18n/config";
import { FeedbackToolbar } from "./components/FeedbackToolbar";
import { diffLines } from "./diff";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  vi.restoreAllMocks();
});

const MEETING_ID = "a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6";
const USER = { id: "11111111-1111-4111-8111-111111111111", name: "Anna" };
const FEEDBACK_ID = "22222222-2222-4222-8222-222222222222";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function feedbackItem(over: Record<string, unknown> = {}) {
  return {
    id: FEEDBACK_ID,
    meeting_id: MEETING_ID,
    protocol_version_n: 2,
    kind: "COMMENT",
    category: null,
    text: "Wrong owner of the task",
    file: null,
    extracted_counts: null,
    author: USER,
    created_at: "2026-06-01T10:00:00.000Z",
    ...over,
  };
}

interface Routes {
  list?: unknown;
  post?: () => Response;
  versions?: unknown;
  version?: Record<number, string>;
}

/** Routes fetch by URL; every body is checked against the contract schema. */
function mockApi(routes: Routes = {}) {
  const posts: FormData[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url.endsWith("/feedback")) {
      posts.push(init!.body as FormData);
      return Promise.resolve(
        routes.post?.() ??
          json(
            FeedbackCreateResponse.parse({
              ...feedbackItem(),
              extracted: null,
            }),
            201,
          ),
      );
    }
    if (url.endsWith("/feedback")) {
      return Promise.resolve(
        json(FeedbackListResponse.parse(routes.list ?? { items: [] })),
      );
    }
    const m = /\/protocol\/versions\/(\d+)$/.exec(url);
    if (m) {
      const n = Number(m[1]);
      return Promise.resolve(
        json(
          ProtocolVersionResponse.parse({
            n,
            kind: n === 1 ? "GENERATED" : "USER_EDIT",
            author: n === 1 ? null : USER,
            generation_id: null,
            created_at: "2026-06-01T10:00:00.000Z",
            markdown: routes.version?.[n] ?? "",
          }),
        ),
      );
    }
    if (url.endsWith("/protocol/versions")) {
      return Promise.resolve(
        json(
          ProtocolVersionListResponse.parse(
            routes.versions ?? { items: [], current_n: null },
          ),
        ),
      );
    }
    return Promise.resolve(json({ message: "not found" }, 404));
  });
  return posts;
}

function renderToolbar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FeedbackToolbar meetingId={MEETING_ID} />
    </QueryClientProvider>,
  );
}

async function openFeedback() {
  const user = userEvent.setup();
  renderToolbar();
  await user.click(screen.getByTestId("btn-feedback"));
  return user;
}

function makeFile(name: string, type: string, size?: number) {
  const file = new File(["x"], name, { type });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("feedback panel", () => {
  it("sends remarks with a category as multipart fields", async () => {
    const posts = mockApi();
    const user = await openFeedback();

    await user.type(screen.getByTestId("feedback-text"), "Wrong owner");
    await user.selectOptions(screen.getByTestId("feedback-category"), "WRONG_TASK");
    await user.click(screen.getByTestId("feedback-submit"));

    await screen.findByTestId("feedback-success");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.get("kind")).toBe("COMMENT");
    expect(posts[0]!.get("category")).toBe("WRONG_TASK");
    expect(posts[0]!.get("text")).toBe("Wrong owner");
    expect(posts[0]!.get("file")).toBeNull();
  });

  it("sends remarks without category", async () => {
    const posts = mockApi();
    const user = await openFeedback();

    await user.type(screen.getByTestId("feedback-text"), "Style is off");
    await user.click(screen.getByTestId("feedback-submit"));

    await screen.findByTestId("feedback-success");
    expect(posts[0]!.has("category")).toBe(false);
  });

  it("refuses empty remarks without calling the API", async () => {
    const posts = mockApi();
    const user = await openFeedback();

    await user.click(screen.getByTestId("feedback-submit"));

    expect(await screen.findByTestId("feedback-error")).toHaveTextContent(
      "Write some text",
    );
    expect(posts).toHaveLength(0);
  });

  it("sends the correct protocol as pasted text", async () => {
    const posts = mockApi();
    const user = await openFeedback();

    await user.click(screen.getByTestId("feedback-tab-corrected"));
    await user.type(screen.getByTestId("feedback-text"), "# Right protocol");
    await user.click(screen.getByTestId("feedback-submit"));

    await screen.findByTestId("feedback-success");
    expect(posts[0]!.get("kind")).toBe("CORRECTED_PROTOCOL");
    expect(posts[0]!.get("text")).toBe("# Right protocol");
  });

  it("sends the correct protocol as a .md file", async () => {
    const posts = mockApi();
    const user = await openFeedback();

    await user.click(screen.getByTestId("feedback-tab-corrected"));
    await user.upload(
      screen.getByTestId("feedback-file"),
      makeFile("protocol.md", "text/markdown"),
    );
    await user.click(screen.getByTestId("feedback-submit"));

    await screen.findByTestId("feedback-success");
    expect((posts[0]!.get("file") as File).name).toBe("protocol.md");
  });

  it("shows how many comments and edits were recognized in a Word file", async () => {
    const extracted = {
      comments: [
        { id: "0", author: "Boris", date: null, text: "fix", anchored_text: "a" },
        { id: "1", author: null, date: null, text: "fix 2", anchored_text: "b" },
      ],
      revisions: [{ type: "ins", author: null, date: null, text: "new" }],
      accepted_text: null,
      original_text: null,
      plain_text: null,
      error: null,
    };
    const posts = mockApi({
      post: () =>
        json(
          FeedbackCreateResponse.parse({
            ...feedbackItem({
              kind: "DOCX_REVIEW",
              text: null,
              file: {
                name: "review.docx",
                mime: DOCX_MIME,
                size_bytes: 100,
                download_path: `/api/meetings/${MEETING_ID}/feedback/${FEEDBACK_ID}/file`,
              },
            }),
            extracted,
          }),
          201,
        ),
    });
    const user = await openFeedback();

    await user.click(screen.getByTestId("feedback-tab-docx"));
    await user.upload(
      screen.getByTestId("feedback-file"),
      makeFile("review.docx", DOCX_MIME),
    );
    await user.click(screen.getByTestId("feedback-submit"));

    expect(await screen.findByTestId("feedback-extracted")).toHaveTextContent(
      "Recognized: 2 comments, 1 edits",
    );
    expect(posts[0]!.get("kind")).toBe("DOCX_REVIEW");
  });

  it("says so when a Word file could not be read", async () => {
    mockApi({
      post: () =>
        json(
          FeedbackCreateResponse.parse({
            ...feedbackItem({ kind: "DOCX_REVIEW", text: null }),
            extracted: { error: "bad zip" },
          }),
          201,
        ),
    });
    const user = await openFeedback();

    await user.click(screen.getByTestId("feedback-tab-docx"));
    await user.upload(
      screen.getByTestId("feedback-file"),
      makeFile("review.docx", DOCX_MIME),
    );
    await user.click(screen.getByTestId("feedback-submit"));

    expect(await screen.findByTestId("feedback-extracted")).toHaveTextContent(
      "could not be read",
    );
  });

  it("rejects a file over the size limit before sending", async () => {
    const posts = mockApi();
    const user = await openFeedback();

    await user.click(screen.getByTestId("feedback-tab-docx"));
    await user.upload(
      screen.getByTestId("feedback-file"),
      makeFile("big.docx", DOCX_MIME, FEEDBACK_FILE_MAX_BYTES + 1),
    );
    await user.click(screen.getByTestId("feedback-submit"));

    expect(await screen.findByTestId("feedback-error")).toHaveTextContent(
      "too large (max 20 MB)",
    );
    expect(posts).toHaveLength(0);
  });

  it("rejects a wrong file type before sending", async () => {
    const posts = mockApi();
    const user = await openFeedback();

    await user.click(screen.getByTestId("feedback-tab-docx"));
    // `applyAccept` would filter a .pdf out in a real picker; the check must hold anyway
    const input = screen.getByTestId("feedback-file") as HTMLInputElement;
    await userEvent
      .setup({ applyAccept: false })
      .upload(input, makeFile("review.pdf", "application/pdf"));
    await user.click(screen.getByTestId("feedback-submit"));

    expect(await screen.findByTestId("feedback-error")).toHaveTextContent(
      "not accepted",
    );
    expect(posts).toHaveLength(0);
  });

  it("requires a file on the Word tab", async () => {
    mockApi();
    const user = await openFeedback();

    await user.click(screen.getByTestId("feedback-tab-docx"));
    await user.click(screen.getByTestId("feedback-submit"));

    expect(await screen.findByTestId("feedback-error")).toHaveTextContent(
      "Attach a file",
    );
  });

  it("shows the server's size error (413)", async () => {
    mockApi({
      post: () =>
        json({ code: "FEEDBACK_FILE_TOO_LARGE", message: "too big" }, 413),
    });
    const user = await openFeedback();

    await user.click(screen.getByTestId("feedback-tab-docx"));
    await user.upload(
      screen.getByTestId("feedback-file"),
      makeFile("review.docx", DOCX_MIME),
    );
    await user.click(screen.getByTestId("feedback-submit"));

    expect(await screen.findByTestId("feedback-error")).toHaveTextContent(
      "too large",
    );
  });

  it("shows the server's type error (415)", async () => {
    mockApi({
      post: () => json({ code: "FEEDBACK_FILE_TYPE", message: "bad type" }, 415),
    });
    const user = await openFeedback();

    await user.click(screen.getByTestId("feedback-tab-docx"));
    await user.upload(
      screen.getByTestId("feedback-file"),
      makeFile("review.docx", DOCX_MIME),
    );
    await user.click(screen.getByTestId("feedback-submit"));

    expect(await screen.findByTestId("feedback-error")).toHaveTextContent(
      "not accepted",
    );
  });

  it("falls back to a generic message on an unknown failure", async () => {
    mockApi({ post: () => json({ message: "boom" }, 500) });
    const user = await openFeedback();

    await user.type(screen.getByTestId("feedback-text"), "x");
    await user.click(screen.getByTestId("feedback-submit"));

    expect(await screen.findByTestId("feedback-error")).toHaveTextContent(
      "Could not send the feedback",
    );
  });
});

describe("feedback panel — revision 1", () => {
  it("does not send remarks typed on another tab with a Word review", async () => {
    const posts = mockApi();
    const user = await openFeedback();

    await user.type(screen.getByTestId("feedback-text"), "stale remark");
    await user.click(screen.getByTestId("feedback-tab-docx"));
    await user.upload(
      screen.getByTestId("feedback-file"),
      makeFile("review.docx", DOCX_MIME),
    );
    await user.click(screen.getByTestId("feedback-submit"));

    await screen.findByTestId("feedback-success");
    expect(posts[0]!.get("kind")).toBe("DOCX_REVIEW");
    expect(posts[0]!.has("text")).toBe(false);
    expect(posts[0]!.has("category")).toBe(false);
  });

  it("accepts a .md file whose browser MIME type is empty", async () => {
    const posts = mockApi();
    const user = await openFeedback();

    await user.click(screen.getByTestId("feedback-tab-corrected"));
    await user.upload(
      screen.getByTestId("feedback-file"),
      makeFile("protocol.md", ""),
    );
    await user.click(screen.getByTestId("feedback-submit"));

    await screen.findByTestId("feedback-success");
    expect(posts).toHaveLength(1);
  });

  it("starts from a clean form after the panel is closed and reopened", async () => {
    mockApi();
    const user = await openFeedback();

    await user.type(screen.getByTestId("feedback-text"), "Sent remark");
    await user.click(screen.getByTestId("feedback-submit"));
    await screen.findByTestId("feedback-success");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByTestId("feedback-dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("btn-feedback"));

    expect(await screen.findByTestId("feedback-form")).toBeInTheDocument();
    expect(screen.queryByTestId("feedback-success")).not.toBeInTheDocument();
    expect(screen.getByTestId("feedback-text")).toHaveValue("");
  });
});

describe("sent feedback list", () => {
  it("shows an empty state", async () => {
    mockApi({ list: { items: [] } });
    await openFeedback();
    expect(await screen.findByTestId("feedback-list-empty")).toBeInTheDocument();
  });

  it("lists who, when, kind and a file download link", async () => {
    mockApi({
      list: {
        items: [
          feedbackItem({
            id: "33333333-3333-4333-8333-333333333333",
            kind: "DOCX_REVIEW",
            text: null,
            file: {
              name: "review.docx",
              mime: DOCX_MIME,
              size_bytes: 10,
              download_path: `/api/meetings/${MEETING_ID}/feedback/33333333-3333-4333-8333-333333333333/file`,
            },
            extracted_counts: { comments: 3, revisions: 1, error: false },
          }),
          feedbackItem({ category: "STYLE" }),
        ],
      },
    });
    await openFeedback();

    const items = await screen.findAllByTestId("feedback-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Word with comments");
    expect(items[0]).toHaveTextContent("Anna");
    expect(items[0]).toHaveTextContent("Recognized: 3 comments, 1 edits");
    expect(within(items[0]!).getByTestId("feedback-file-link")).toHaveAttribute(
      "href",
      `/api/meetings/${MEETING_ID}/feedback/33333333-3333-4333-8333-333333333333/file`,
    );
    expect(items[1]).toHaveTextContent("Style");
    expect(items[1]).toHaveTextContent("Wrong owner of the task");
  });

  it("refreshes the list after sending", async () => {
    mockApi();
    const user = await openFeedback();
    await screen.findByTestId("feedback-list-empty");

    await user.type(screen.getByTestId("feedback-text"), "More");
    await user.click(screen.getByTestId("feedback-submit"));
    await screen.findByTestId("feedback-success");

    await waitFor(() => {
      const calls = vi
        .mocked(globalThis.fetch)
        .mock.calls.filter(
          ([u, i]) =>
            String(u).endsWith("/feedback") && (i?.method ?? "GET") === "GET",
        );
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("version history", () => {
  const VERSIONS = {
    items: [
      {
        n: 1,
        kind: "GENERATED",
        author: null,
        generation_id: null,
        created_at: "2026-06-01T09:00:00.000Z",
      },
      {
        n: 2,
        kind: "USER_EDIT",
        author: USER,
        generation_id: null,
        created_at: "2026-06-01T10:00:00.000Z",
      },
      {
        n: 3,
        kind: "USER_EDIT",
        author: USER,
        generation_id: null,
        created_at: "2026-06-01T11:00:00.000Z",
      },
    ],
    current_n: 3,
  };
  const TEXTS = {
    1: "# Title\nline a\nline b",
    2: "# Title\nline a\nline b2",
    3: "# Title\nline a\nline b2\nline c",
  };

  async function openHistory() {
    const user = userEvent.setup();
    renderToolbar();
    await user.click(screen.getByTestId("btn-version-history"));
    return user;
  }

  it("lists three versions with kind, author and the current one", async () => {
    mockApi({ versions: VERSIONS, version: TEXTS });
    await openHistory();

    const items = await screen.findAllByTestId("history-item");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Generated");
    expect(items[1]).toHaveTextContent("Edit");
    expect(items[1]).toHaveTextContent("by Anna");
    expect(items[2]).toHaveTextContent("current");
  });

  it("opens a version", async () => {
    mockApi({ versions: VERSIONS, version: TEXTS });
    const user = await openHistory();

    await user.click(await screen.findByTestId("history-view-2"));

    expect(await screen.findByTestId("history-markdown")).toHaveTextContent(
      "line b2",
    );
  });

  it("compares a version with the original line by line", async () => {
    mockApi({ versions: VERSIONS, version: TEXTS });
    const user = await openHistory();

    await user.click(await screen.findByTestId("history-compare-3"));

    const diff = await screen.findByTestId("history-diff");
    const lines = [...diff.querySelectorAll("[data-diff]")].map((el) => [
      el.getAttribute("data-diff"),
      el.textContent,
    ]);
    expect(lines).toEqual([
      ["same", "  # Title"],
      ["same", "  line a"],
      ["del", "- line b"],
      ["add", "+ line b2"],
      ["add", "+ line c"],
    ]);
  });

  it("says there is no difference when a version equals the original", async () => {
    mockApi({ versions: VERSIONS, version: { ...TEXTS, 2: TEXTS[1] } });
    const user = await openHistory();

    await user.click(await screen.findByTestId("history-compare-2"));

    expect(await screen.findByTestId("history-identical")).toBeInTheDocument();
  });

  it("explains when the original is lost (legacy history)", async () => {
    mockApi({
      versions: {
        items: [
          {
            n: 1,
            kind: "LEGACY",
            author: null,
            generation_id: null,
            created_at: "2026-06-01T09:00:00.000Z",
          },
        ],
        current_n: 1,
      },
      version: { 1: "x" },
    });
    const user = await openHistory();

    await user.click(await screen.findByTestId("history-compare-1"));

    expect(await screen.findByTestId("history-no-original")).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    mockApi({ versions: { items: [], current_n: null } });
    await openHistory();
    expect(await screen.findByTestId("history-empty")).toBeInTheDocument();
  });

  it("shows an error with retry when the history fails to load", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ message: "x" }, 500));
    await openHistory();
    expect(await screen.findByTestId("history-error")).toBeInTheDocument();
  });
});

describe("diffLines", () => {
  it("marks equal, removed and added lines", () => {
    expect(diffLines("a\nb\nc", "a\nx\nc")).toEqual([
      { op: "same", text: "a" },
      { op: "del", text: "b" },
      { op: "add", text: "x" },
      { op: "same", text: "c" },
    ]);
  });

  it("handles appended and removed tails", () => {
    expect(diffLines("a", "a\nb")).toEqual([
      { op: "same", text: "a" },
      { op: "add", text: "b" },
    ]);
    expect(diffLines("a\nb", "a")).toEqual([
      { op: "same", text: "a" },
      { op: "del", text: "b" },
    ]);
  });
});
