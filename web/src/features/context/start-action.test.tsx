import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeetingDetailResponse } from "@transcrib/shared";
import { featureRegistry } from "@/lib/features";
import { SlotOutlet } from "@/components/layout/slot";
import i18n from "@/i18n/config";

// A meeting uploaded with defer_start but left unstarted (reload / navigation away from
// /upload) must still be startable from its card, through the meeting.actions slot.

const MEETING_ID = "a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6";
const NOW = "2026-10-07T10:00:00.000Z";

function detail(status: string) {
  return MeetingDetailResponse.parse({
    meeting: {
      id: MEETING_ID,
      title: "t",
      status,
      language: null,
      project_id: null,
      project_name: null,
      uploaded_at: NOW,
      updated_at: NOW,
    },
    recording: {
      filename: "m.mp4",
      size_bytes: 1024,
      mime_type: "VIDEO_MP4",
      duration_sec: null,
    },
    latest_transcription_job: null,
    latest_protocol_job: null,
    transcript_exists: false,
    protocol_exists: false,
  });
}

interface Call {
  method: string;
  url: string;
  body: unknown;
}

function mockApi(status: string) {
  const calls: Call[] = [];
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { "Content-Type": "application/json" },
    });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const u = String(url);
    const method = (init as RequestInit | undefined)?.method ?? "GET";
    const raw = (init as RequestInit | undefined)?.body;
    calls.push({ method, url: u, body: typeof raw === "string" ? JSON.parse(raw) : undefined });
    if (u.endsWith(`/api/meetings/${MEETING_ID}`)) return json(detail(status));
    if (u.endsWith(`/api/meetings/${MEETING_ID}/context`) && method === "GET") {
      return json({ message: "none" }, 404);
    }
    if (u.includes("/api/projects?")) return json({ items: [] });
    if (u.endsWith(`/api/meetings/${MEETING_ID}/context`) && method === "PUT") {
      return json({
        ...(JSON.parse(raw as string) as object),
        meeting_id: MEETING_ID,
        snapshot_hash: null,
        frozen: false,
        updated_at: NOW,
      });
    }
    if (u.endsWith(`/api/meetings/${MEETING_ID}/start`)) {
      return json({ meeting_id: MEETING_ID, status: "TRANSCRIBING", snapshot_hash: null });
    }
    return new Response("Not found", { status: 404 });
  });
  return calls;
}

function renderSlot() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SlotOutlet name="meeting.actions" meetingId={MEETING_ID} />
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => vi.restoreAllMocks());

describe("meeting.actions — start an unstarted meeting from its card", () => {
  it("is registered through the context feature", () => {
    expect(featureRegistry.slots["meeting.actions"].length).toBeGreaterThan(0);
  });

  it("offers «Start recognition» for AWAITING_START and starts it without a context PUT", async () => {
    const calls = mockApi("AWAITING_START");
    renderSlot();
    await userEvent.click(await screen.findByTestId("meeting-start-open"));
    await userEvent.click(await screen.findByTestId("meeting-start-submit"));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/start"))).toBe(true),
    );
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("lets the user add context before starting (PUT, then start)", async () => {
    const calls = mockApi("AWAITING_START");
    renderSlot();
    await userEvent.click(await screen.findByTestId("meeting-start-open"));
    await userEvent.type(await screen.findByTestId("context-goal"), "Sync");
    await userEvent.click(screen.getByTestId("meeting-start-submit"));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/start"))).toBe(true),
    );
    const put = calls.findIndex((c) => c.method === "PUT");
    const start = calls.findIndex((c) => c.method === "POST" && c.url.endsWith("/start"));
    expect(put).toBeGreaterThan(-1);
    expect(put).toBeLessThan(start);
    expect(calls[put]!.body).toMatchObject({ goal: "Sync" });
  });

  it("offers nothing once recognition has started", async () => {
    mockApi("TRANSCRIBING");
    renderSlot();
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByTestId("meeting-start-open")).not.toBeInTheDocument();
  });
});
