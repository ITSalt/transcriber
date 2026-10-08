import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import {
  LastProtocolResponse,
  MeetingContextPutRequest,
  ProjectDetailResponse,
  ProjectListResponse,
  ProjectParticipant,
  StartMeetingResponse,
} from "@transcrib/shared";
import i18n from "@/i18n/config";
import { WithSession, WS_PERSONAL } from "@/lib/test-utils";
import UploadPage from "./index";

// FR-004 / D-9: project + context form before recognition. Every mocked API answer is
// parsed through the shared Zod schema of the contract, so the mocks cannot drift from it.

const WS = WS_PERSONAL;
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const MEETING_ID = "a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6";
const PREV_MEETING_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-10-07T10:00:00.000Z";

const PROJECT_LIST = ProjectListResponse.parse({
  items: [
    {
      id: PROJECT_ID,
      workspace_id: WS,
      name: "Alpha",
      description: null,
      meeting_count: 2,
      created_at: NOW,
      updated_at: NOW,
    },
  ],
});

function participant(n: number) {
  return {
    id: `3333333${n}-3333-4333-8333-333333333333`,
    name: `Person ${n}`,
    aliases: [],
    role: "PM",
    organization: "ACME",
    side: "CLIENT" as const,
  };
}

const PROJECT_DETAIL = ProjectDetailResponse.parse({
  project: PROJECT_LIST.items[0],
  participants: [participant(1), participant(2), participant(3)],
  glossary: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      term: "Kubernetes",
      variants: ["k8s"],
      definition: null,
      asr_keyterm: true,
    },
  ],
});

const LAST_PROTOCOL = LastProtocolResponse.parse({
  meeting_id: PREV_MEETING_ID,
  meeting_title: "Kickoff",
  version_n: 2,
  markdown: "# Kickoff",
  created_at: NOW,
});

interface Call {
  method: string;
  url: string;
  body: unknown;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Routes all API traffic of the upload page; returns the recorded calls. */
function mockApi(
  opts: {
    lastProtocol?: boolean;
    completeStatus?: "AWAITING_START" | "TRANSCRIBING";
    startConflict?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const u = String(url);
    const method = (init as RequestInit | undefined)?.method ?? "GET";
    const raw = (init as RequestInit | undefined)?.body;
    const body = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    calls.push({ method, url: u, body });

    if (u.includes("/api/uploads/init")) {
      return json({
        s3_key: "pending/x.mp4",
        s3_upload_id: "up-1",
        part_size: 10 * 1024 * 1024,
        parts: [{ part_number: 1, url: "http://localhost:9000/part-1" }],
      });
    }
    if (method === "PUT" && u.startsWith("http://localhost:9000")) {
      return new Response("", { status: 200, headers: { ETag: '"e1"' } });
    }
    if (u.includes("/api/uploads/complete")) {
      return json({ meeting_id: MEETING_ID, status: opts.completeStatus ?? "AWAITING_START" });
    }
    if (u.includes("/api/projects?")) return json(PROJECT_LIST);
    if (u.endsWith(`/api/projects/${PROJECT_ID}`)) return json(PROJECT_DETAIL);
    if (u.endsWith(`/api/projects/${PROJECT_ID}/last-protocol`)) {
      return opts.lastProtocol === false
        ? json({ code: "PREVIOUS_PROTOCOL_UNAVAILABLE", message: "none" }, 404)
        : json(LAST_PROTOCOL);
    }
    if (u.endsWith(`/api/projects/${PROJECT_ID}/participants`) && method === "POST") {
      return json(ProjectParticipant.parse(participant(9)), 201);
    }
    if (u.endsWith(`/api/meetings/${MEETING_ID}/context`) && method === "PUT") {
      return json({
        ...MeetingContextPutRequest.parse(body),
        meeting_id: MEETING_ID,
        snapshot_hash: null,
        frozen: false,
        updated_at: NOW,
      });
    }
    if (u.endsWith(`/api/meetings/${MEETING_ID}/start`)) {
      if (opts.startConflict) {
        return json({ code: "MEETING_NOT_AWAITING_START", message: "already started" }, 409);
      }
      return json(
        StartMeetingResponse.parse({
          meeting_id: MEETING_ID,
          status: "TRANSCRIBING",
          snapshot_hash: "abc",
        }),
      );
    }
    return new Response("Not found", { status: 404 });
  });
  return calls;
}

function renderUpload() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/upload", element: <UploadPage /> },
      { path: "/meetings/:id", element: <div data-testid="meeting-detail" /> },
    ],
    { initialEntries: ["/upload"] },
  );
  return render(
    <QueryClientProvider client={client}>
      <WithSession>
        <RouterProvider router={router} />
      </WithSession>
    </QueryClientProvider>,
  );
}

async function uploadFile() {
  const file = new File([new ArrayBuffer(1024)], "meeting.mp4", { type: "video/mp4" });
  await userEvent.upload(screen.getByTestId("upload-input-file"), file);
  await userEvent.click(screen.getByTestId("upload-submit"));
  await waitFor(() => expect(screen.getByTestId("upload-start")).not.toBeDisabled());
}

async function selectProject() {
  // the option arrives with the project list
  await screen.findByRole("option", { name: "Alpha" });
  await userEvent.selectOptions(screen.getByTestId("context-project"), PROJECT_ID);
  await screen.findByTestId("context-project-info");
}

function callsTo(calls: Call[], method: string, suffix: string) {
  return calls.filter((c) => c.method === method && c.url.endsWith(suffix));
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => vi.restoreAllMocks());

describe("UploadPage — project and context (FR-004)", () => {
  it("fills in the project's participants and glossary read-only, marked «from project»", async () => {
    mockApi();
    renderUpload();
    await selectProject();

    const people = within(screen.getByTestId("context-project-participants"));
    expect(people.getAllByRole("listitem")).toHaveLength(3);
    expect(people.getByText("Person 2")).toBeInTheDocument();
    expect(within(screen.getByTestId("context-project-glossary")).getByText("Kubernetes")).toBeInTheDocument();
    expect(within(screen.getByTestId("context-project-info")).getAllByText("from project")).toHaveLength(2);
    // read-only: no inputs inside the project block
    expect(within(screen.getByTestId("context-project-info")).queryAllByRole("textbox")).toHaveLength(0);
  });

  it("start is disabled until the file is uploaded, then enabled", async () => {
    mockApi();
    renderUpload();
    expect(screen.getByTestId("upload-start")).toBeDisabled();
    await uploadFile();
    expect(screen.getByTestId("upload-start")).not.toBeDisabled();
  });

  it("completes the upload with defer_start and does not start recognition by itself", async () => {
    const calls = mockApi();
    renderUpload();
    await uploadFile();

    const complete = callsTo(calls, "POST", "/api/uploads/complete")[0]!;
    expect((complete.body as Record<string, unknown>)["defer_start"]).toBe(true);
    expect(callsTo(calls, "POST", `/api/meetings/${MEETING_ID}/start`)).toHaveLength(0);
    expect(screen.queryByTestId("meeting-detail")).not.toBeInTheDocument();
  });

  it("skipping the context: start goes straight to POST /start without a context PUT", async () => {
    const calls = mockApi();
    renderUpload();
    await uploadFile();
    await userEvent.click(screen.getByTestId("upload-start"));

    await waitFor(() => expect(screen.getByTestId("meeting-detail")).toBeInTheDocument());
    expect(callsTo(calls, "PUT", `/api/meetings/${MEETING_ID}/context`)).toHaveLength(0);
    expect(callsTo(calls, "POST", `/api/meetings/${MEETING_ID}/start`)).toHaveLength(1);
  });

  it("with a project and additions: PUT context (meeting additions only, last protocol by default) before /start", async () => {
    const calls = mockApi();
    renderUpload();
    await selectProject();
    await screen.findByText(/Kickoff \(version 2\)/);

    await userEvent.selectOptions(screen.getByTestId("context-type"), "NEGOTIATION");
    await userEvent.type(screen.getByTestId("context-goal"), "Agree the scope");
    await userEvent.type(screen.getByTestId("context-participant-form-name"), "Guest");
    await userEvent.click(screen.getByTestId("context-participant-form-submit"));

    await uploadFile();
    await userEvent.click(screen.getByTestId("upload-start"));
    await waitFor(() => expect(screen.getByTestId("meeting-detail")).toBeInTheDocument());

    const put = callsTo(calls, "PUT", `/api/meetings/${MEETING_ID}/context`)[0]!;
    const body = MeetingContextPutRequest.parse(put.body);
    expect(body.project_id).toBe(PROJECT_ID);
    expect(body.meeting_type).toBe("NEGOTIATION");
    expect(body.goal).toBe("Agree the scope");
    // only the addition — the project's 3 participants are merged by the server at /start
    expect(body.participants.map((p) => p.name)).toEqual(["Guest"]);
    expect(body.participants[0]!.source).toBe("meeting");
    expect(body.previous_protocol).toEqual({
      source: "project",
      meeting_id: PREV_MEETING_ID,
      text: null,
    });

    // order: PUT context → POST start
    const idx = (m: string, suffix: string) =>
      calls.findIndex((c) => c.method === m && c.url.endsWith(suffix));
    expect(idx("PUT", `/api/meetings/${MEETING_ID}/context`)).toBeLessThan(
      idx("POST", `/api/meetings/${MEETING_ID}/start`),
    );
  });

  it("additions do not touch the project without the explicit «Add to project» button", async () => {
    const calls = mockApi();
    renderUpload();
    await selectProject();

    await userEvent.type(screen.getByTestId("context-participant-form-name"), "Guest");
    await userEvent.click(screen.getByTestId("context-participant-form-submit"));
    await userEvent.type(screen.getByTestId("context-term-form-term"), "Foo");
    await userEvent.click(screen.getByTestId("context-term-form-submit"));
    await uploadFile();
    await userEvent.click(screen.getByTestId("upload-start"));
    await waitFor(() => expect(screen.getByTestId("meeting-detail")).toBeInTheDocument());

    const projectWrites = calls.filter(
      (c) => c.url.includes(`/api/projects/${PROJECT_ID}/`) && c.method !== "GET",
    );
    expect(projectWrites).toHaveLength(0);
  });

  it("«Add to project» posts the participant to the project and moves it out of the additions", async () => {
    const calls = mockApi();
    renderUpload();
    await selectProject();

    await userEvent.type(screen.getByTestId("context-participant-form-name"), "Guest");
    await userEvent.click(screen.getByTestId("context-participant-form-submit"));
    expect(screen.getByTestId("context-extra-participant-0")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("context-extra-participant-0-to-project"));
    await waitFor(() =>
      expect(screen.queryByTestId("context-extra-participant-0")).not.toBeInTheDocument(),
    );
    const posts = callsTo(calls, "POST", `/api/projects/${PROJECT_ID}/participants`);
    expect(posts).toHaveLength(1);
    expect((posts[0]!.body as Record<string, unknown>)["name"]).toBe("Guest");
  });

  it("pasted previous protocol is sent as source=upload", async () => {
    const calls = mockApi({ lastProtocol: false });
    renderUpload();
    await userEvent.selectOptions(screen.getByTestId("context-previous-mode"), "paste");
    await userEvent.type(screen.getByTestId("context-previous-text"), "# Old protocol");
    await uploadFile();
    await userEvent.click(screen.getByTestId("upload-start"));
    await waitFor(() => expect(screen.getByTestId("meeting-detail")).toBeInTheDocument());

    const put = callsTo(calls, "PUT", `/api/meetings/${MEETING_ID}/context`)[0]!;
    expect(MeetingContextPutRequest.parse(put.body).previous_protocol).toEqual({
      source: "upload",
      text: "# Old protocol",
    });
  });

  it("removing the previous protocol sends source=none", async () => {
    const calls = mockApi();
    renderUpload();
    await selectProject();
    await screen.findByText(/Kickoff \(version 2\)/);
    await userEvent.selectOptions(screen.getByTestId("context-previous-mode"), "none");
    await uploadFile();
    await userEvent.click(screen.getByTestId("upload-start"));
    await waitFor(() => expect(screen.getByTestId("meeting-detail")).toBeInTheDocument());

    const put = callsTo(calls, "PUT", `/api/meetings/${MEETING_ID}/context`)[0]!;
    expect(MeetingContextPutRequest.parse(put.body).previous_protocol).toEqual({ source: "none" });
  });

  it("shows the recognition limit hint (50 names/terms)", async () => {
    mockApi();
    renderUpload();
    expect(screen.getByTestId("context-limit-hint")).toHaveTextContent(
      "Up to 50 names and terms are passed to recognition",
    );
    expect(screen.getByTestId("context-limit-hint")).toHaveAttribute("data-over-limit", "false");
  });

  it("backend that ignores defer_start (status TRANSCRIBING): goes straight to the card, no start step", async () => {
    const calls = mockApi({ completeStatus: "TRANSCRIBING" });
    renderUpload();
    const file = new File([new ArrayBuffer(1024)], "meeting.mp4", { type: "video/mp4" });
    await userEvent.upload(screen.getByTestId("upload-input-file"), file);
    await userEvent.click(screen.getByTestId("upload-submit"));

    await waitFor(() => expect(screen.getByTestId("meeting-detail")).toBeInTheDocument());
    expect(callsTo(calls, "POST", `/api/meetings/${MEETING_ID}/start`)).toHaveLength(0);
  });

  it("409 MEETING_NOT_AWAITING_START on start: the meeting is already running, open the card", async () => {
    mockApi({ startConflict: true });
    renderUpload();
    await uploadFile();
    await userEvent.click(screen.getByTestId("upload-start"));

    await waitFor(() => expect(screen.getByTestId("meeting-detail")).toBeInTheDocument());
    expect(screen.queryByTestId("upload-error")).not.toBeInTheDocument();
  });
});
