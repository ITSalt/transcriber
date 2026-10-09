import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  MeetingDetailResponse,
  SpeakersPutRequest,
  SpeakersResponse,
} from "@transcrib/shared";
import { SlotOutlet } from "@/components/layout/slot";
import i18n from "@/i18n/config";
import { buildMapping } from "./mapping";

const MEETING_ID = "a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6";
const PROJECT_ID = "b0000000-0000-4000-8000-000000000001";
const ANNA = "e0000000-0000-4000-8000-000000000001";
const BORIS = "e0000000-0000-4000-8000-000000000002";
const NOW = "2026-10-07T10:00:00.000Z";

function detail(status: string) {
  return MeetingDetailResponse.parse({
    meeting: {
      id: MEETING_ID,
      title: "t",
      status,
      language: null,
      uploaded_at: NOW,
      updated_at: NOW,
    },
    recording: { filename: "m.mp4", size_bytes: 1024, mime_type: "VIDEO_MP4", duration_sec: null },
    latest_transcription_job: null,
    latest_protocol_job: null,
    transcript_exists: true,
    protocol_exists: false,
  });
}

const speakersBody = SpeakersResponse.parse({
  meeting_id: MEETING_ID,
  status: "AWAITING_SPEAKERS",
  project_id: PROJECT_ID,
  participants: [
    { id: ANNA, name: "Анна", role: "PM", organization: null },
    { id: BORIS, name: "Борис", role: null, organization: "ACME" },
  ],
  labels: [
    {
      label: "SPEAKER_0",
      display: "ignored-1",
      duration_sec: 65,
      segment_count: 5,
      samples: [
        { start_ms: 45000, text: "Давайте начнём встречу" },
        { start_ms: 90000, text: "Второй пункт повестки" },
        { start_ms: 120000, text: "Итоги" },
      ],
      name: null,
      participant_id: null,
    },
    {
      label: "SPEAKER_1",
      display: "ignored-2",
      duration_sec: 30,
      segment_count: 2,
      samples: [{ start_ms: 5000, text: "Согласен" }],
      name: null,
      participant_id: null,
    },
    {
      label: "SPEAKER_2",
      display: "ignored-3",
      duration_sec: 12,
      segment_count: 1,
      samples: [{ start_ms: 7000, text: "Я тоже" }],
      name: null,
      participant_id: null,
    },
  ],
  confirmed_at: null,
});

interface Call {
  method: string;
  url: string;
  body: unknown;
}

function mockApi(status: string, put?: () => Response) {
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
    if (u.endsWith(`/api/meetings/${MEETING_ID}/speakers`)) {
      if (method === "PUT") {
        return (
          put?.() ?? json({ meeting_id: MEETING_ID, status: "GENERATING_PROTOCOL" })
        );
      }
      return json(speakersBody);
    }
    return json({ message: "none" }, 404);
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

const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT");

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => vi.restoreAllMocks());

describe("speakers confirmation (AWAITING_SPEAKERS)", () => {
  it("renders every label with its duration and samples", async () => {
    mockApi("AWAITING_SPEAKERS");
    renderSlot();
    expect(await screen.findByTestId("speaker-SPEAKER_0")).toHaveTextContent("Speaker 1");
    expect(screen.getByTestId("speaker-SPEAKER_0")).toHaveTextContent("1:05");
    expect(screen.getByTestId("speaker-SPEAKER_0")).toHaveTextContent("Давайте начнём встречу");
    expect(screen.getByTestId("speaker-SPEAKER_0")).toHaveTextContent("00:45");
    expect(screen.getByTestId("speaker-SPEAKER_1")).toHaveTextContent("Согласен");
    expect(screen.getByTestId("speakers-split-hint")).toBeInTheDocument();
  });

  it.each(["TRANSCRIBING", "GENERATING_PROTOCOL", "PROTOCOL_READY", "TRANSCRIBED"])(
    "is hidden in %s and never requests speakers",
    async (status) => {
      const calls = mockApi(status);
      renderSlot();
      await waitFor(() => expect(calls.some((c) => c.url.endsWith(MEETING_ID))).toBe(true));
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByTestId("speakers-confirmation")).not.toBeInTheDocument();
      expect(calls.some((c) => c.url.endsWith("/speakers"))).toBe(false);
    },
  );

  it("sends a project participant as participant_id", async () => {
    const calls = mockApi("AWAITING_SPEAKERS");
    renderSlot();
    await userEvent.selectOptions(await screen.findByTestId("speaker-select-SPEAKER_0"), `p:${ANNA}`);
    await userEvent.click(screen.getByTestId("speakers-confirm"));

    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    const body = puts(calls)[0]!.body;
    expect(SpeakersPutRequest.parse(body)).toEqual({
      action: "confirm",
      mapping: [{ label: "SPEAKER_0", participant_id: ANNA }],
    });
  });

  it("sends a free-form name (trimmed)", async () => {
    const calls = mockApi("AWAITING_SPEAKERS");
    renderSlot();
    await userEvent.selectOptions(await screen.findByTestId("speaker-select-SPEAKER_1"), "__name");
    await userEvent.type(screen.getByTestId("speaker-name-SPEAKER_1"), "  Виктор  ");
    await userEvent.click(screen.getByTestId("speakers-confirm"));

    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(SpeakersPutRequest.parse(puts(calls)[0]!.body).mapping).toEqual([
      { label: "SPEAKER_1", name: "Виктор" },
    ]);
  });

  it("merges a label into another: both get the same participant", async () => {
    const calls = mockApi("AWAITING_SPEAKERS");
    renderSlot();
    await userEvent.selectOptions(await screen.findByTestId("speaker-select-SPEAKER_0"), `p:${BORIS}`);
    await userEvent.selectOptions(screen.getByTestId("speaker-select-SPEAKER_2"), "m:SPEAKER_0");
    await userEvent.click(screen.getByTestId("speakers-confirm"));

    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(SpeakersPutRequest.parse(puts(calls)[0]!.body).mapping).toEqual([
      { label: "SPEAKER_0", participant_id: BORIS },
      { label: "SPEAKER_2", participant_id: BORIS },
    ]);
  });

  it("only offers merging into earlier labels", async () => {
    mockApi("AWAITING_SPEAKERS");
    renderSlot();
    const first = await screen.findByTestId("speaker-select-SPEAKER_0");
    expect(first.querySelector('option[value^="m:"]')).toBeNull();
    const third = screen.getByTestId("speaker-select-SPEAKER_2");
    expect(third.querySelectorAll('option[value^="m:"]')).toHaveLength(2);
  });

  it("blocks «confirm» with an empty name and shows the error", async () => {
    const calls = mockApi("AWAITING_SPEAKERS");
    renderSlot();
    await userEvent.selectOptions(await screen.findByTestId("speaker-select-SPEAKER_1"), "__name");
    await userEvent.click(screen.getByTestId("speakers-confirm"));

    expect(await screen.findByTestId("speaker-name-error-SPEAKER_1")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);
  });

  it("«Skip» sends action skip with no mapping", async () => {
    const calls = mockApi("AWAITING_SPEAKERS");
    renderSlot();
    await userEvent.selectOptions(await screen.findByTestId("speaker-select-SPEAKER_0"), `p:${ANNA}`);
    await userEvent.click(screen.getByTestId("speakers-skip"));

    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0]!.body).toEqual({ action: "skip", mapping: [] });
  });

  it("merge into a «keep» label sends the root's «Speaker N» (built from the label, not the API display) as name (PUT body)", async () => {
    const calls = mockApi("AWAITING_SPEAKERS");
    renderSlot();
    await userEvent.selectOptions(await screen.findByTestId("speaker-select-SPEAKER_1"), "m:SPEAKER_0");
    await userEvent.click(screen.getByTestId("speakers-confirm"));

    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(SpeakersPutRequest.parse(puts(calls)[0]!.body).mapping).toEqual([
      { label: "SPEAKER_0", name: "Speaker 1" },
      { label: "SPEAKER_1", name: "Speaker 1" },
    ]);
  });

  it("RU: labels read «Спикер N» and the merge body carries the RU root name", async () => {
    await i18n.changeLanguage("ru");
    try {
      const calls = mockApi("AWAITING_SPEAKERS");
      renderSlot();
      expect(await screen.findByTestId("speaker-SPEAKER_0")).toHaveTextContent("Спикер 1");
      expect(screen.getByTestId("speaker-SPEAKER_1")).toHaveTextContent("Спикер 2");
      const select = screen.getByTestId("speaker-select-SPEAKER_1");
      expect(select).toHaveTextContent("Тот же, что Спикер 1");
      await userEvent.selectOptions(select, "m:SPEAKER_0");
      await userEvent.click(screen.getByTestId("speakers-confirm"));
      await waitFor(() => expect(puts(calls)).toHaveLength(1));
      expect(SpeakersPutRequest.parse(puts(calls)[0]!.body).mapping).toEqual([
        { label: "SPEAKER_0", name: "Спикер 1" },
        { label: "SPEAKER_1", name: "Спикер 1" },
      ]);
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it("stays disabled after a successful PUT: a second click sends nothing", async () => {
    const calls = mockApi("AWAITING_SPEAKERS");
    renderSlot();
    await userEvent.click(await screen.findByTestId("speakers-skip"));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(screen.getByTestId("speakers-skip")).toBeDisabled();
    expect(screen.getByTestId("speakers-confirm")).toBeDisabled();
    await userEvent.click(screen.getByTestId("speakers-skip"));
    expect(puts(calls)).toHaveLength(1);
  });

  it("on 409 shows a message and re-requests the meeting status", async () => {
    const calls = mockApi("AWAITING_SPEAKERS", () =>
      new Response(JSON.stringify({ code: "MEETING_NOT_AWAITING_SPEAKERS", message: "x" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    renderSlot();
    await userEvent.click(await screen.findByTestId("speakers-skip"));

    expect(await screen.findByTestId("speakers-error")).toHaveTextContent(/already confirmed/i);
    const meetingGets = () =>
      calls.filter((c) => c.method === "GET" && c.url.endsWith(`/api/meetings/${MEETING_ID}`));
    await waitFor(() => expect(meetingGets().length).toBeGreaterThan(1));
  });
});

describe("buildMapping", () => {
  it("leaves «keep» out and sends the root's name for both root and merged label", () => {
    expect(
      buildMapping(
        {
          SPEAKER_0: { kind: "keep" },
          SPEAKER_1: { kind: "merge", target: "SPEAKER_0" },
          SPEAKER_2: { kind: "keep" },
        },
        { SPEAKER_0: "Speaker 1", SPEAKER_1: "Speaker 2", SPEAKER_2: "Speaker 3" },
      ),
    ).toEqual([
      { label: "SPEAKER_0", name: "Speaker 1" },
      { label: "SPEAKER_1", name: "Speaker 1" },
    ]);
  });

  it("follows a merge chain to the root", () => {
    expect(
      buildMapping({
        SPEAKER_0: { kind: "name", name: " Анна " },
        SPEAKER_1: { kind: "merge", target: "SPEAKER_0" },
        SPEAKER_2: { kind: "merge", target: "SPEAKER_1" },
      }),
    ).toEqual([
      { label: "SPEAKER_0", name: "Анна" },
      { label: "SPEAKER_1", name: "Анна" },
      { label: "SPEAKER_2", name: "Анна" },
    ]);
  });
});
