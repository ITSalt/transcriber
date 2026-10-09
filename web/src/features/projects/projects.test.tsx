import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { WorkspaceMeetingListResponse, ProjectDetailResponse, ProjectListResponse, ProjectParticipant } from "@transcrib/shared";
import i18n from "@/i18n/config";
import { WithSession, WS_PERSONAL } from "@/lib/test-utils";
import { featureRegistry } from "@/lib/features";
import { routes } from "./index";

const WS = WS_PERSONAL;
const PID = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-10-07T10:00:00.000Z";
const SUMMARY = {
  id: PID, workspace_id: WS, name: "Alpha", description: "Main deal",
  meeting_count: 2, created_at: NOW, updated_at: NOW,
};

let MEETINGS: unknown[] = [];
const MID = "44444444-4444-4444-8444-444444444444";

interface Call { method: string; url: string; body: unknown }

function mockApi() {
  const calls: Call[] = [];
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const u = String(url);
    const method = (init as RequestInit | undefined)?.method ?? "GET";
    const raw = (init as RequestInit | undefined)?.body;
    const body = typeof raw === "string" ? (JSON.parse(raw) as unknown) : undefined;
    calls.push({ method, url: u, body });
    if (u.includes("/api/meetings?")) {
      return json(WorkspaceMeetingListResponse.parse({ items: MEETINGS }));
    }
    if (u.includes("/api/projects?")) return json(ProjectListResponse.parse({ items: [SUMMARY] }));
    if (u.endsWith("/api/projects") && method === "POST") {
      return json(ProjectDetailResponse.parse({ project: { ...SUMMARY, name: "New" }, participants: [], glossary: [] }), 201);
    }
    if (u.endsWith(`/api/projects/${PID}`) && method === "GET") {
      return json(ProjectDetailResponse.parse({ project: SUMMARY, participants: [], glossary: [] }));
    }
    if (u.endsWith(`/participants`) && method === "POST") {
      return json(ProjectParticipant.parse({ id: "33333333-3333-4333-8333-333333333333", name: "Anna", aliases: ["Аня"], role: "PM", organization: null, side: "CLIENT" }), 201);
    }
    return new Response("Not found", { status: 404 });
  });
  return calls;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={client}>
      <WithSession>
        <RouterProvider router={router} />
      </WithSession>
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => {
  vi.restoreAllMocks();
  MEETINGS = [];
});

describe("projects feature", () => {
  it("registers the nav item and routes through the feature glob (D-15)", () => {
    expect(featureRegistry.navItems.map((n) => n.to)).toContain("/projects");
    expect(featureRegistry.routes.map((r) => r.path)).toEqual(
      expect.arrayContaining(["/projects", "/projects/:projectId"]),
    );
  });

  it("lists projects of the workspace", async () => {
    const calls = mockApi();
    renderAt("/projects");
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(calls[0]!.url).toContain(`workspace_id=${WS}`);
  });

  it("creates a project and opens its card", async () => {
    const calls = mockApi();
    renderAt("/projects");
    await userEvent.type(await screen.findByTestId("project-create-name"), "New");
    await userEvent.click(screen.getByTestId("project-create-submit"));
    await screen.findByTestId("project-detail");
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/api/projects"))!;
    expect(post.body).toMatchObject({ workspace_id: WS, name: "New" });
  });

  it("adds a participant with aliases, role and side on the card", async () => {
    const calls = mockApi();
    renderAt(`/projects/${PID}`);
    await screen.findByTestId("project-detail");
    const form = within(screen.getByTestId("participant-form"));
    await userEvent.type(form.getByTestId("participant-form-name"), "Anna");
    await userEvent.type(form.getByTestId("participant-form-aliases"), "Аня, Anya");
    await userEvent.type(form.getByTestId("participant-form-role"), "PM");
    await userEvent.selectOptions(form.getByTestId("participant-form-side"), "CLIENT");
    await userEvent.click(form.getByTestId("participant-form-submit"));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/participants"))).toBe(true),
    );
    const post = calls.find((c) => c.url.endsWith("/participants"))!;
    expect(post.body).toEqual({
      name: "Anna",
      aliases: ["Аня", "Anya"],
      role: "PM",
      organization: null,
      side: "CLIENT",
    });
  });

  it("labels the nav item «Projects & assignments» (D-42)", async () => {
    expect(i18n.t("projects:nav")).toBe("Projects & assignments");
    await i18n.changeLanguage("ru");
    expect(i18n.t("projects:nav")).toBe("Проекты и поручения");
    await i18n.changeLanguage("en");
  });

  it("shows the project's meetings with links to /meetings/:id", async () => {
    MEETINGS = [
      {
        id: MID, title: "Kickoff", filename: "k.mp4", status: "PROTOCOL_READY",
        uploaded_at: NOW, workspace_id: WS, project_id: PID, project_name: "Alpha",
      },
    ];
    const calls = mockApi();
    renderAt(`/projects/${PID}`);
    const row = await screen.findByTestId(`project-meeting-${MID}`);
    expect(within(row).getByText("Kickoff")).toBeInTheDocument();
    expect(within(row).getByRole("link")).toHaveAttribute("href", `/meetings/${MID}`);
    const call = calls.find((c) => c.url.includes("/api/meetings?"))!;
    expect(call.url).toContain(`workspace_id=${WS}`);
    expect(call.url).toContain(`project_id=${PID}`);
  });

  it("shows the empty state and an upload link with the project preselected", async () => {
    mockApi();
    renderAt(`/projects/${PID}`);
    expect(await screen.findByTestId("project-meetings-empty")).toBeInTheDocument();
    expect(screen.getByTestId("project-upload")).toHaveAttribute("href", `/upload?project=${PID}`);
  });
});
