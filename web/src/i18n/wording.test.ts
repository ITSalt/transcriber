import { describe, it, expect } from "vitest";
import { MeetingStatus } from "@transcrib/shared";
import ru from "./ru.json";
import en from "./en.json";
import speakersRu from "@/features/speakers/i18n/ru.json";

describe("core wording (D-40..D-42)", () => {
  it("ru.json never uses the word «задач»", () => {
    expect(JSON.stringify(ru).toLowerCase()).not.toContain("задач");
  });

  it("speakers ru.json does not use «Speaker N»", () => {
    expect(JSON.stringify(speakersRu)).not.toContain("Speaker N");
  });

  it.each([
    ["ru", ru],
    ["en", en],
  ])("%s has a catalog.status label for every MeetingStatus", (_lang, dict) => {
    const status = dict.catalog.status as Record<string, string>;
    for (const value of MeetingStatus.options) {
      expect(status[value], value).toBeTruthy();
    }
  });

  it("upload.* has no speaker-count strings", () => {
    for (const dict of [ru, en]) {
      expect(JSON.stringify(dict.upload)).not.toMatch(/SpeakerCount|спикеров/i);
    }
  });
});
