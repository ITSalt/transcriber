import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeetingContextResponse } from "@transcrib/shared";
import i18n from "@/i18n/config";
import { featureRegistry } from "@/lib/features";
import { ContextSnapshotAction } from "./ContextSnapshotAction";

const MEETING_ID = "a1b2c3d4-1234-4abc-8def-a1b2c3d4e5f6";

const SNAPSHOT = MeetingContextResponse.parse({
  meeting_id: MEETING_ID,
  project_id: "11111111-1111-4111-8111-111111111111",
  meeting_type: "STATUS",
  goal: "Weekly sync",
  agenda: null,
  participants: [
    { name: "Anna", source: "project", participant_id: "33333333-3333-4333-8333-333333333333", side: "CLIENT" },
    { name: "Boris", source: "project", participant_id: "33333334-3333-4333-8333-333333333333" },
    { name: "Guest", source: "meeting" },
  ],
  glossary: [{ term: "Kubernetes", source: "meeting" }],
  previous_protocol: { source: "project", meeting_id: "22222222-2222-4222-8222-222222222222", text: "# Prev" },
  notes: null,
  snapshot_hash: "0123456789abcdef",
  frozen: true,
  updated_at: "2026-10-07T10:00:00.000Z",
});

function renderAction(status: number, body?: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify(body ?? { message: "none" }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContextSnapshotAction meetingId={MEETING_ID} />
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => vi.restoreAllMocks());

describe("meeting card — used context snapshot", () => {
  it("is contributed to the meeting.actions slot automatically", () => {
    expect(featureRegistry.slots["meeting.actions"].length).toBeGreaterThan(0);
  });

  it("shows the frozen snapshot with participant sources", async () => {
    renderAction(200, SNAPSHOT);
    await userEvent.click(await screen.findByTestId("context-snapshot-open"));

    const dialog = await screen.findByTestId("context-snapshot");
    expect(within(dialog).getByText(/fixed at the start of recognition/)).toBeInTheDocument();
    const people = within(within(dialog).getByTestId("context-snapshot-participants"));
    expect(people.getAllByRole("listitem")).toHaveLength(3);
    expect(people.getAllByText("from project")).toHaveLength(2);
    expect(people.getByText("this meeting")).toBeInTheDocument();
    expect(within(dialog).getByTestId("context-snapshot-previous")).toHaveTextContent("# Prev");
  });

  it("renders nothing for a meeting that has no context", async () => {
    renderAction(404);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("context-snapshot-open")).not.toBeInTheDocument();
  });
});
