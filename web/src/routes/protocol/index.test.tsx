import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import i18n from "@/i18n/config";
import ProtocolPage from "./index";

// Lock i18n to English for predictable assertions
beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Mock ProtocolEditor (Milkdown requires real DOM — not available in jsdom)
// The mock exposes a data-testid="protocol-editor-trigger-change" button to
// simulate an onChange event fired by Milkdown (RQ-031 testing).
vi.mock("./components/ProtocolEditor", () => ({
  ProtocolEditor: ({
    initialValue,
    editorHandleRef,
    onChange,
  }: {
    initialValue: string;
    editorHandleRef: React.MutableRefObject<{ getMarkdown: () => string } | null>;
    onChange?: () => void;
  }) => {
    // Immediately register a handle that returns the initial value (simulates the editor)
    if (editorHandleRef) {
      editorHandleRef.current = { getMarkdown: () => initialValue };
    }
    return (
      <div data-testid="protocol-editor">
        <textarea
          data-testid="protocol-editor-textarea"
          defaultValue={initialValue}
        />
        {/* Button that lets tests simulate a Milkdown onChange event */}
        <button
          type="button"
          data-testid="protocol-editor-trigger-change"
          onClick={() => onChange?.()}
        >
          Trigger change
        </button>
      </div>
    );
  },
}));

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

function mockFetchSequence(responses: Array<{ body: unknown; status?: number }>) {
  let call = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    const idx = Math.min(call, responses.length - 1);
    const resp = responses[idx]!;
    call++;
    return Promise.resolve(makeJsonResponse(resp.body, resp.status ?? 200));
  });
}

const MEETING_ID = "a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6";
const PROTOCOL_ID = "c3d4e5f6-3456-4cde-bef0-c3d4e5f6a7b8";

const MOCK_PROTOCOL = {
  id: PROTOCOL_ID,
  meeting_id: MEETING_ID,
  markdown_content: "# Meeting notes\n\nSome content here.",
  version: 1,
  edit_count: 0,
  generated_at: "2026-05-18T10:00:00.000Z",
  last_edited_at: null,
};

const MOCK_SAVE_RESPONSE = {
  version: 2,
  edit_count: 1,
  last_edited_at: "2026-05-18T11:00:00.000Z",
  meeting_status: "EDITED",
};

function renderProtocolPage(id = MEETING_ID) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/meetings/:id/protocol",
        element: <ProtocolPage />,
      },
      {
        path: "/meetings/:id",
        element: <div data-testid="meeting-detail-page" />,
      },
    ],
    { initialEntries: [`/meetings/${id}/protocol`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("ProtocolPage", () => {
  it("renders the page container", () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    expect(screen.getByTestId("protocol-page")).toBeInTheDocument();
  });

  it("shows loading state while fetching", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    renderProtocolPage();
    expect(screen.getByTestId("protocol-loading")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", async () => {
    mockFetch({ message: "Not Found" }, 404);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("protocol-error")).toBeInTheDocument();
    });
  });

  // CT01 — markdown_content field renders
  it("CT01: renders Protocol (Markdown) content label", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByText("Protocol (Markdown)")).toBeInTheDocument();
    });
  });

  it("CT01: renders protocol viewer in view mode", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("protocol-viewer")).toBeInTheDocument();
    });
  });

  it("CT01: renders Protocol (Markdown) label in Russian", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByText("Протокол (Markdown)")).toBeInTheDocument();
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // CT02 — version field renders
  it("CT02: renders Version label", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByText("Version")).toBeInTheDocument();
    });
  });

  it("CT02: renders version value", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("protocol-version")).toBeInTheDocument();
      expect(screen.getByTestId("protocol-version").textContent).toBe("1");
    });
  });

  it("CT02: renders Version label in Russian", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByText("Версия")).toBeInTheDocument();
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // CT03 — edit_count field renders
  it("CT03: renders Edits label", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByText("Edits")).toBeInTheDocument();
    });
  });

  it("CT03: renders edit_count value", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("protocol-edit_count")).toBeInTheDocument();
      expect(screen.getByTestId("protocol-edit_count").textContent).toBe("0");
    });
  });

  it("CT03: renders Edits label in Russian", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByText("Правки")).toBeInTheDocument();
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // CT04 — last_edited_at field renders
  it("CT04: renders Last edited label", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByText("Last edited")).toBeInTheDocument();
    });
  });

  it("CT04: renders last_edited_at value (null shown as dash)", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("protocol-last_edited_at")).toBeInTheDocument();
      expect(screen.getByTestId("protocol-last_edited_at").textContent).toBe("—");
    });
  });

  it("CT04: renders Last edited label in Russian", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByText("Последнее редактирование")).toBeInTheDocument();
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // CT05 — generated_at field renders
  it("CT05: renders Generated label", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByText("Generated")).toBeInTheDocument();
    });
  });

  it("CT05: renders generated_at value", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("protocol-generated_at")).toBeInTheDocument();
    });
  });

  it("CT05: renders Generated label in Russian", async () => {
    const { act } = await import("@testing-library/react");
    await act(async () => {
      await i18n.changeLanguage("ru");
    });
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByText("Сгенерировано")).toBeInTheDocument();
    });
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  // Edit mode toggle
  it("renders Edit button and switches to edit mode", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("btn-edit")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-edit"));
    await waitFor(() => {
      expect(screen.getByTestId("protocol-editor")).toBeInTheDocument();
      expect(screen.getByTestId("btn-save")).toBeInTheDocument();
      expect(screen.getByTestId("btn-cancel-edit")).toBeInTheDocument();
    });
  });

  // Save mutation
  it("calls PUT endpoint when Save is clicked and shows success indicator", async () => {
    mockFetchSequence([
      { body: MOCK_PROTOCOL },
      { body: MOCK_SAVE_RESPONSE },
    ]);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("btn-edit")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-edit"));
    await waitFor(() => {
      expect(screen.getByTestId("btn-save")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-save"));
    await waitFor(() => {
      expect(screen.getByTestId("protocol-save-success")).toBeInTheDocument();
    });
    // View mode restored after save
    expect(screen.queryByTestId("btn-save")).not.toBeInTheDocument();
    expect(screen.getByTestId("btn-edit")).toBeInTheDocument();
  });

  it("updates version after successful save", async () => {
    mockFetchSequence([
      { body: MOCK_PROTOCOL },
      { body: MOCK_SAVE_RESPONSE },
    ]);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("protocol-version").textContent).toBe("1");
    });
    await userEvent.click(screen.getByTestId("btn-edit"));
    await waitFor(() => screen.getByTestId("btn-save"));
    await userEvent.click(screen.getByTestId("btn-save"));
    await waitFor(() => {
      expect(screen.getByTestId("protocol-version").textContent).toBe("2");
    });
  });

  // Export PDF
  it("renders Export PDF link pointing to the correct endpoint", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("btn-export-pdf")).toBeInTheDocument();
    });
    const link = screen.getByTestId("btn-export-pdf").closest("a");
    expect(link).not.toBeNull();
    expect(link!.href).toContain(`/api/meetings/${MEETING_ID}/protocol/pdf`);
  });

  // Back navigation
  it("renders back to meeting button", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("btn-back-to-meeting")).toBeInTheDocument();
    });
  });

  it("navigates back to meeting detail when back button is clicked", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("btn-back-to-meeting")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("btn-back-to-meeting"));
    await waitFor(() => {
      expect(screen.getByTestId("meeting-detail-page")).toBeInTheDocument();
    });
  });

  // All metadata present together
  it("shows version, edit_count, last_edited_at, generated_at together", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPage();
    await waitFor(() => {
      expect(screen.getByTestId("protocol-version")).toBeInTheDocument();
      expect(screen.getByTestId("protocol-edit_count")).toBeInTheDocument();
      expect(screen.getByTestId("protocol-last_edited_at")).toBeInTheDocument();
      expect(screen.getByTestId("protocol-generated_at")).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RQ-031: Unsaved-changes guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders the protocol page inside a memory router that also has a destination
 * route so we can test navigation attempts.
 */
function renderProtocolPageWithNav(id = MEETING_ID) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/meetings/:id/protocol",
        element: <ProtocolPage />,
      },
      {
        path: "/meetings/:id",
        element: <div data-testid="meeting-detail-page" />,
      },
    ],
    { initialEntries: [`/meetings/${id}/protocol`] },
  );
  return { router, ...render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )};
}

describe("RQ-031: unsaved-changes guard", () => {
  it("isDirty is false on initial render — no confirmation dialog shown", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPageWithNav();
    await waitFor(() => {
      expect(screen.getByTestId("protocol-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("unsaved-changes-dialog")).not.toBeInTheDocument();
  });

  it("isDirty becomes true when Milkdown onChange fires", async () => {
    mockFetch(MOCK_PROTOCOL);
    renderProtocolPageWithNav();

    // Enter edit mode
    await waitFor(() => screen.getByTestId("btn-edit"));
    await userEvent.click(screen.getByTestId("btn-edit"));
    await waitFor(() => screen.getByTestId("protocol-editor-trigger-change"));

    // Trigger the change event
    await userEvent.click(screen.getByTestId("protocol-editor-trigger-change"));

    // No modal yet (navigation has not been attempted) but isDirty=true is tracked
    // The beforeunload listener is registered — verified by the fact that clicking
    // navigate will now trigger the blocker (tested below).
    // Here we just verify the editor is still visible (user has not been booted).
    expect(screen.getByTestId("protocol-editor")).toBeInTheDocument();
  });

  it("shows confirmation dialog when in-app navigation is attempted with unsaved changes", async () => {
    mockFetch(MOCK_PROTOCOL);
    const { router } = renderProtocolPageWithNav();

    // Enter edit mode and mark dirty
    await waitFor(() => screen.getByTestId("btn-edit"));
    await userEvent.click(screen.getByTestId("btn-edit"));
    await waitFor(() => screen.getByTestId("protocol-editor-trigger-change"));
    await userEvent.click(screen.getByTestId("protocol-editor-trigger-change"));

    // Attempt in-app navigation
    await act(async () => {
      await router.navigate(`/meetings/${MEETING_ID}`);
    });

    // Confirmation dialog must appear
    await waitFor(() => {
      expect(screen.getByTestId("unsaved-changes-dialog")).toBeInTheDocument();
      expect(screen.getByTestId("unsaved-changes-title")).toBeInTheDocument();
      expect(screen.getByTestId("unsaved-changes-body")).toBeInTheDocument();
    });
  });

  it("clicking Confirm in dialog proceeds with navigation (blocker.proceed)", async () => {
    mockFetch(MOCK_PROTOCOL);
    const { router } = renderProtocolPageWithNav();

    // Enter edit mode and mark dirty
    await waitFor(() => screen.getByTestId("btn-edit"));
    await userEvent.click(screen.getByTestId("btn-edit"));
    await waitFor(() => screen.getByTestId("protocol-editor-trigger-change"));
    await userEvent.click(screen.getByTestId("protocol-editor-trigger-change"));

    // Attempt navigation
    await act(async () => {
      await router.navigate(`/meetings/${MEETING_ID}`);
    });

    // Wait for dialog
    await waitFor(() => screen.getByTestId("unsaved-changes-confirm"));

    // Click Confirm
    await userEvent.click(screen.getByTestId("unsaved-changes-confirm"));

    // Navigation should have proceeded
    await waitFor(() => {
      expect(screen.getByTestId("meeting-detail-page")).toBeInTheDocument();
    });
  });

  it("clicking Cancel in dialog keeps user on the protocol page (blocker.reset)", async () => {
    mockFetch(MOCK_PROTOCOL);
    const { router } = renderProtocolPageWithNav();

    // Enter edit mode and mark dirty
    await waitFor(() => screen.getByTestId("btn-edit"));
    await userEvent.click(screen.getByTestId("btn-edit"));
    await waitFor(() => screen.getByTestId("protocol-editor-trigger-change"));
    await userEvent.click(screen.getByTestId("protocol-editor-trigger-change"));

    // Attempt navigation
    await act(async () => {
      await router.navigate(`/meetings/${MEETING_ID}`);
    });

    // Wait for dialog
    await waitFor(() => screen.getByTestId("unsaved-changes-cancel"));

    // Click Cancel
    await userEvent.click(screen.getByTestId("unsaved-changes-cancel"));

    // Protocol page must still be shown
    await waitFor(() => {
      expect(screen.getByTestId("protocol-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("meeting-detail-page")).not.toBeInTheDocument();
  });

  it("after a successful save isDirty is false — navigation proceeds without confirmation", async () => {
    mockFetchSequence([
      { body: MOCK_PROTOCOL },
      { body: MOCK_SAVE_RESPONSE },
    ]);
    const { router } = renderProtocolPageWithNav();

    // Enter edit mode and mark dirty
    await waitFor(() => screen.getByTestId("btn-edit"));
    await userEvent.click(screen.getByTestId("btn-edit"));
    await waitFor(() => screen.getByTestId("protocol-editor-trigger-change"));
    await userEvent.click(screen.getByTestId("protocol-editor-trigger-change"));

    // Save
    await userEvent.click(screen.getByTestId("btn-save"));
    await waitFor(() => screen.getByTestId("protocol-save-success"));

    // Navigate — should NOT trigger blocker
    await act(async () => {
      await router.navigate(`/meetings/${MEETING_ID}`);
    });

    await waitFor(() => {
      expect(screen.getByTestId("meeting-detail-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("unsaved-changes-dialog")).not.toBeInTheDocument();
  });
});
