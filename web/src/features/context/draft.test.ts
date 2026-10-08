import { describe, it, expect } from "vitest";
import { ASR_KEYTERMS_MAX } from "@transcrib/shared";
import {
  buildPutRequest,
  countRecognitionTerms,
  emptyDraft,
  isDraftEmpty,
} from "./draft";

describe("context draft", () => {
  it("an untouched form is empty (context is skipped)", () => {
    expect(isDraftEmpty(emptyDraft)).toBe(true);
  });

  it("any field makes it non-empty", () => {
    expect(isDraftEmpty({ ...emptyDraft, projectId: "p" })).toBe(false);
    expect(isDraftEmpty({ ...emptyDraft, goal: " x " })).toBe(false);
    expect(
      isDraftEmpty({ ...emptyDraft, previousMode: "paste", previousText: "t" }),
    ).toBe(false);
    // a mode alone, without text, is not content
    expect(isDraftEmpty({ ...emptyDraft, previousMode: "paste" })).toBe(true);
  });

  it("without a project the previous protocol is none, even in «project» mode", () => {
    const body = buildPutRequest(emptyDraft, "ignored");
    expect(body.previous_protocol).toEqual({ source: "none" });
    expect(body.project_id).toBeNull();
  });

  it("project without a protocol yet sends none", () => {
    const body = buildPutRequest({ ...emptyDraft, projectId: "p" }, null);
    expect(body.previous_protocol).toEqual({ source: "none" });
  });

  it("blank text fields become null", () => {
    const body = buildPutRequest({ ...emptyDraft, goal: "  ", notes: "n" }, null);
    expect(body.goal).toBeNull();
    expect(body.notes).toBe("n");
  });

  it("counts names, spelling variants, distinct organizations and flagged terms", () => {
    const draft = {
      ...emptyDraft,
      participants: [
        { name: "A", aliases: ["a1", "a2"], role: null, organization: "Org", side: "OTHER" as const },
        { name: "B", aliases: [], role: null, organization: "org", side: "OTHER" as const },
      ],
      glossary: [
        { term: "T", variants: [], definition: null, asr_keyterm: true },
        { term: "U", variants: [], definition: null, asr_keyterm: false },
      ],
    };
    // names 2 + aliases 2 + 1 org + 1 flagged term
    expect(countRecognitionTerms(undefined, draft)).toBe(6);
    expect(ASR_KEYTERMS_MAX).toBe(50);
  });
});
