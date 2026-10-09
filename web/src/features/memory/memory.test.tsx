import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import {
  DecisionListResponse,
  MeetingMemoryRefsResponse,
  ProjectMemoryResponse,
  ReviewDecisionResponse,
  ReviewQueueResponse,
  TaskDetailResponse,
  TaskListResponse,
  type MemoryTask,
} from "@transcrib/shared";
import i18n from "@/i18n/config";
import ru from "./i18n/ru.json";
import { collectFeatures, featureRegistry } from "@/lib/features";
import { ProjectMemoryTabs } from "./components/ProjectMemoryTabs";
import { MeetingMemoryRefs } from "./components/MeetingMemoryRefs";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => vi.restoreAllMocks());

const P = "11111111-1111-4111-8111-111111111111";
const M1 = "22222222-2222-4222-8222-222222222221";
const M2 = "22222222-2222-4222-8222-222222222222";
const ANNA = "33333333-3333-4333-8333-333333333331";
const EV = "44444444-4444-4444-8444-444444444441";
const NOW = "2026-05-01T10:00:00.000Z";

function task(over: Partial<MemoryTask> & { code: string }): MemoryTask {
  return {
    id: crypto.randomUUID(),
    title: `Task ${over.code}`,
    description: null,
    status: "OPEN",
    assignee: null,
    due_date: null,
    merged_into: null,
    created_in_meeting_id: M1,
    pending_count: 0,
    updated_at: NOW,
    ...over,
  };
}

const T1 = task({ code: "T-1", assignee: { participant_id: ANNA, name: "Anna" } });
const T2 = task({ code: "T-2", status: "DONE", pending_count: 1 });

const detail = TaskDetailResponse.parse({
  task: T1,
  mentions: [
    {
      meeting_id: M1,
      meeting_title: "Kickoff",
      kind: "CREATED",
      quote: "Anna will prepare the budget",
      start_ms: 65000,
      end_ms: 70000,
      speaker_label: "Speaker 1",
    },
    {
      meeting_id: M2,
      meeting_title: "Sync #2",
      kind: "STATUS_UPDATE",
      quote: "Budget is moving to next week",
      start_ms: null,
      end_ms: null,
      speaker_label: null,
    },
  ],
  events: [
    {
      id: EV,
      task_code: "T-1",
      field: "status",
      old_value: "OPEN",
      new_value: "IN_PROGRESS",
      valid_at: NOW,
      recorded_at: NOW,
      superseded_at: null,
      source: "LLM",
      confidence: 0.9,
      reason: null,
      review_state: "AUTO",
      meeting_id: M2,
      quote: "Started the budget",
      author_user_id: null,
    },
  ],
});

const queueItem = {
  event: {
    ...detail.events[0]!,
    id: "44444444-4444-4444-8444-444444444442",
    new_value: "DONE",
    old_value: "OPEN",
    confidence: 0.82,
    review_state: "PENDING",
    quote: "Yes, the budget is done",
  },
  task: { id: T1.id, code: "T-1", title: T1.title, status: T1.status },
  meeting_title: "Sync #2",
};

interface Route {
  method?: string;
  match: RegExp;
  body: unknown;
  status?: number;
}

function mockApi(routes: Route[]) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = routes.find((x) => (x.method ?? "GET") === method && x.match.test(url));
      if (!r) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    }),
  );
  return calls;
}

function renderTabs(initial = `/projects/${P}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <ProjectMemoryTabs projectId={P} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tasksRoute = (items: MemoryTask[], match = /\/tasks(\?.*)?$/): Route => ({
  match,
  body: TaskListResponse.parse({ items }),
});
const queueRoute = (items: unknown[]): Route => ({
  match: /review-queue$/,
  body: ReviewQueueResponse.parse({ items, count: items.length }),
});

describe("registration", () => {
  it("the memory feature contributes project.tabs and protocol.toolbar slots", () => {
    expect(featureRegistry.slots["project.tabs"]).toContain(ProjectMemoryTabs);
    expect(featureRegistry.slots["protocol.toolbar"]).toContain(MeetingMemoryRefs);
    const reg = collectFeatures({});
    expect(reg.slots["project.tabs"]).toHaveLength(0);
  });
});

describe("tasks tab: filters", () => {
  it("lists tasks and sends status and assignee filters to the API", async () => {
    const calls = mockApi([
      queueRoute([]),
      tasksRoute([T1], /tasks\?status=OPEN&assignee=/),
      tasksRoute([T1, T2]),
    ]);
    renderTabs();
    expect(await screen.findByTestId("task-row-T-1")).toBeInTheDocument();
    expect(screen.getByTestId("task-row-T-2")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByTestId("filter-status"), "OPEN");
    await userEvent.selectOptions(screen.getByTestId("filter-assignee"), ANNA);

    await waitFor(() =>
      expect(calls.some((c) => c.url.includes(`/tasks?status=OPEN&assignee=${ANNA}`))).toBe(true),
    );
    await waitFor(() => expect(screen.queryByTestId("task-row-T-2")).not.toBeInTheDocument());
  });
});

describe("task history", () => {
  it("shows creation meeting, mentions with quote and timecode link, and change log", async () => {
    mockApi([
      queueRoute([]),
      { match: /tasks\/T-1$/, body: detail },
      tasksRoute([T1, T2]),
    ]);
    renderTabs();
    await userEvent.click(await screen.findByTestId("task-row-T-1"));

    const panel = await screen.findByTestId("task-detail");
    expect(within(await screen.findByTestId("task-created-in")).getByRole("link", { name: "Kickoff" })).toHaveAttribute(
      "href",
      `/meetings/${M1}`,
    );
    expect(within(panel).getByText("Anna will prepare the budget")).toBeInTheDocument();
    const tc = screen.getAllByTestId("mention-timecode");
    expect(tc).toHaveLength(1); // the second mention has no timecode
    expect(tc[0]).toHaveAttribute("href", `/meetings/${M1}/transcript?t=65000`);
    expect(tc[0]).toHaveTextContent("1:05");
    const log = screen.getByTestId("task-events");
    expect(log).toHaveTextContent("OPEN → IN_PROGRESS");
    expect(log).toHaveTextContent("AI");
  });
});

describe("manual edit", () => {
  it("PATCHes only the changed fields and offers only legal status transitions", async () => {
    const updated = TaskDetailResponse.parse({
      ...detail,
      task: { ...T1, status: "DONE", due_date: "2026-06-01", updated_at: "2026-05-02T10:00:00.000Z" },
    });
    let patched = false;
    const calls = mockApi([
      queueRoute([]),
      { method: "PATCH", match: /tasks\/T-1$/, body: updated },
      tasksRoute([T1]),
    ]);
    // GET detail returns the updated task (new updated_at) once patched, as the real API does.
    const base = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH") patched = true;
        if (/tasks\/T-1$/.test(url) && (init?.method ?? "GET") === "GET") {
          return new Response(JSON.stringify(patched ? updated : detail), { status: 200 });
        }
        return base(url, init);
      }),
    );
    renderTabs();
    await userEvent.click(await screen.findByTestId("task-row-T-1"));
    const status = await screen.findByTestId("task-edit-status");
    // OPEN → IN_PROGRESS/DONE/CANCELLED/POSTPONED + OPEN itself
    expect(within(status).getAllByRole("option")).toHaveLength(5);

    await userEvent.selectOptions(status, "DONE");
    await userEvent.type(screen.getByTestId("task-edit-due"), "2026-06-01");
    await userEvent.click(screen.getByTestId("task-edit-save"));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === "PATCH");
      expect(patch?.body).toEqual({ status: "DONE", due_date: "2026-06-01" });
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    // The refetch brought a new updated_at (form remounted) — the message must survive it.
    await waitFor(() =>
      expect(screen.getByTestId("task-edit-status")).toHaveValue("DONE"),
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("restricts a DONE task to reopening", async () => {
    mockApi([
      queueRoute([]),
      { match: /tasks\/T-2$/, body: { ...detail, task: T2 } },
      tasksRoute([T2]),
    ]);
    renderTabs();
    await userEvent.click(await screen.findByTestId("task-row-T-2"));
    const status = await screen.findByTestId("task-edit-status");
    expect(within(status).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual([
      "OPEN",
      "DONE",
    ]);
  });

  it("can unassign a task (assignee_participant_id: null)", async () => {
    const calls = mockApi([
      queueRoute([]),
      { method: "PATCH", match: /tasks\/T-1$/, body: { ...detail, task: { ...T1, assignee: null } } },
      { match: /tasks\/T-1$/, body: detail },
      tasksRoute([T1]),
    ]);
    renderTabs();
    await userEvent.click(await screen.findByTestId("task-row-T-1"));
    await userEvent.selectOptions(await screen.findByTestId("task-edit-assignee"), "");
    await userEvent.click(screen.getByTestId("task-edit-save"));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ assignee_participant_id: null }),
    );
  });

  it("shows the API error when the transition is rejected", async () => {
    mockApi([
      queueRoute([]),
      { method: "PATCH", match: /tasks\/T-1$/, body: { message: "bad transition" }, status: 400 },
      { match: /tasks\/T-1$/, body: detail },
      tasksRoute([T1]),
    ]);
    renderTabs();
    await userEvent.click(await screen.findByTestId("task-row-T-1"));
    await userEvent.selectOptions(await screen.findByTestId("task-edit-status"), "DONE");
    await userEvent.click(screen.getByTestId("task-edit-save"));
    expect(await screen.findByTestId("task-edit-error")).toHaveTextContent("bad transition");
  });
});

describe("review queue (D-14)", () => {
  it("shows the counter, quote and was → now; confirm calls the API and refreshes", async () => {
    let confirmed = false;
    const calls = mockApi([
      {
        method: "POST",
        match: /task-events\/.*\/confirm$/,
        body: ReviewDecisionResponse.parse({
          event: { ...queueItem.event, review_state: "CONFIRMED" },
          task: { ...T1, status: "DONE" },
        }),
      },
      tasksRoute([T1]),
    ]);
    // dynamic queue: empty after confirmation
    const base = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (/review-queue$/.test(url)) {
          const items = confirmed ? [] : [queueItem];
          return new Response(
            JSON.stringify(ReviewQueueResponse.parse({ items, count: items.length })),
            { status: 200 },
          );
        }
        if (init?.method === "POST") confirmed = true;
        return base(url, init);
      }),
    );

    renderTabs();
    expect(await screen.findByTestId("review-counter")).toHaveTextContent("1");
    await userEvent.click(screen.getByTestId("memory-tab-review"));

    const item = await screen.findByTestId(`review-item-${queueItem.event.id}`);
    expect(within(item).getByText("Yes, the budget is done")).toBeInTheDocument();
    expect(within(item).getByTestId("review-old")).toHaveTextContent("OPEN");
    expect(within(item).getByTestId("review-new")).toHaveTextContent("DONE");
    expect(item).toHaveTextContent("confidence 82%");

    await userEvent.click(within(item).getByRole("button", { name: "Confirm" }));
    expect(await screen.findByTestId("review-empty")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("review-counter")).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith(`/task-events/${queueItem.event.id}/confirm`))).toBe(true);
  });

  it("reject calls the reject endpoint", async () => {
    const calls = mockApi([
      queueRoute([queueItem]),
      {
        method: "POST",
        match: /task-events\/.*\/reject$/,
        body: ReviewDecisionResponse.parse({
          event: { ...queueItem.event, review_state: "REJECTED" },
          task: T1,
        }),
      },
      tasksRoute([T1]),
    ]);
    renderTabs(`/projects/${P}?mem=review`);
    await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/reject"))).toBe(true),
    );
  });

  it("refetches the queue after a 409 so the handled item and counter go away", async () => {
    let conflicted = false;
    const calls = mockApi([
      { method: "POST", match: /confirm$/, body: { message: "TASK_EVENT_ALREADY_REVIEWED" }, status: 409 },
      tasksRoute([T1]),
    ]);
    const base = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (/review-queue$/.test(url)) {
          const items = conflicted ? [] : [queueItem];
          calls.push({ url, method: "GET", body: undefined });
          return new Response(
            JSON.stringify(ReviewQueueResponse.parse({ items, count: items.length })),
            { status: 200 },
          );
        }
        if (init?.method === "POST") conflicted = true;
        return base(url, init);
      }),
    );
    renderTabs(`/projects/${P}?mem=review`);
    await userEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(await screen.findByTestId("review-empty")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("review-counter")).not.toBeInTheDocument());
    expect(calls.filter((c) => /review-queue$/.test(c.url)).length).toBeGreaterThanOrEqual(2);
  });

  it("shows the conflict message on 409 (already reviewed)", async () => {
    mockApi([
      queueRoute([queueItem]),
      {
        method: "POST",
        match: /confirm$/,
        body: { message: "TASK_EVENT_ALREADY_REVIEWED" },
        status: 409,
      },
      tasksRoute([T1]),
    ]);
    renderTabs(`/projects/${P}?mem=review`);
    await userEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(await screen.findByTestId("review-error")).toHaveTextContent("TASK_EVENT_ALREADY_REVIEWED");
  });
});

describe("decisions and summary tabs", () => {
  it("lists decisions", async () => {
    mockApi([
      queueRoute([]),
      {
        match: /decisions$/,
        body: DecisionListResponse.parse({
          items: [
            {
              id: crypto.randomUUID(),
              code: "D-1",
              text: "Use Postgres",
              superseded_by: "D-2",
              meeting_id: M1,
              quote: "let's use Postgres",
              leads_to: ["T-1"],
              created_at: NOW,
            },
          ],
        }),
      },
    ]);
    renderTabs(`/projects/${P}?mem=decisions`);
    const d = await screen.findByTestId("decision-D-1");
    expect(d).toHaveTextContent("Use Postgres");
    expect(d).toHaveTextContent("superseded by D-2");
    expect(d).toHaveTextContent("T-1");
  });

  it("renders the current summary and the version history", async () => {
    mockApi([
      queueRoute([]),
      {
        match: /\/memory$/,
        body: ProjectMemoryResponse.parse({
          current: { version: 2, source_meeting_id: M2, created_at: NOW, summary_md: "## Status\n\nOn track" },
          versions: [
            { version: 2, source_meeting_id: M2, created_at: NOW },
            { version: 1, source_meeting_id: M1, created_at: NOW },
          ],
        }),
      },
    ]);
    renderTabs(`/projects/${P}?mem=summary`);
    expect(await screen.findByRole("heading", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByText("Current version v2")).toBeInTheDocument();
    expect(within(screen.getByTestId("summary-versions")).getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows an empty state when there is no summary yet", async () => {
    mockApi([queueRoute([]), { match: /\/memory$/, body: { current: null, versions: [] } }]);
    renderTabs(`/projects/${P}?mem=summary`);
    expect(await screen.findByTestId("summary-empty")).toBeInTheDocument();
  });
});

describe("degradation", () => {
  it("shows 'memory unavailable' on 503 without breaking the page", async () => {
    mockApi([
      { match: /review-queue$/, body: { message: "MEMORY_UNAVAILABLE" }, status: 503 },
      { match: /tasks/, body: { message: "MEMORY_UNAVAILABLE" }, status: 503 },
    ]);
    renderTabs();
    expect((await screen.findAllByTestId("memory-unavailable")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("memory-tab-decisions")).toBeInTheDocument();
  });
});

describe("protocol page references", () => {
  function renderRefs() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MeetingMemoryRefs meetingId={M1} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("links T-n and D-n codes to the project memory", async () => {
    mockApi([
      {
        match: /memory-refs$/,
        body: MeetingMemoryRefsResponse.parse({
          project_id: P,
          tasks: [{ code: "T-1", title: "Budget", status: "OPEN" }],
          decisions: [{ code: "D-3", text: "Use Postgres" }],
        }),
      },
    ]);
    renderRefs();
    expect(await screen.findByTestId("ref-T-1")).toHaveAttribute("href", `/projects/${P}?mem=tasks&task=T-1`);
    expect(screen.getByTestId("ref-D-3")).toHaveAttribute("href", `/projects/${P}?mem=decisions`);
  });

  it("renders nothing for a meeting outside a project", async () => {
    const calls = mockApi([
      { match: /memory-refs$/, body: { project_id: null, tasks: [], decisions: [] } },
    ]);
    renderRefs();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByTestId("memory-refs")).not.toBeInTheDocument();
  });
});

describe("terminology (D-42)", () => {
  it("ru.json does not contain the banned stem — assignments, not tasks", () => {
    // Stem built from code points so this file itself stays free of the word.
    const banned = String.fromCharCode(0x437, 0x430, 0x434, 0x430, 0x447);
    expect(JSON.stringify(ru).toLowerCase()).not.toContain(banned);
    expect(ru.tabs.tasks).toBe("Поручения");
    expect(ru.tasks.empty).toBe("Поручений пока нет.");
  });
});
