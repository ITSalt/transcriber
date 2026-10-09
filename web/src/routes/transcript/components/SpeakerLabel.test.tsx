import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n/config";
import { SpeakerLabel } from "./SpeakerLabel";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("SpeakerLabel numbering (D-41)", () => {
  it("shows index 0 as «Speaker 1» (same as the confirmation screen)", () => {
    render(<SpeakerLabel speakerId="SPEAKER_0" speakerMap={null} />);
    expect(screen.getByTestId("speaker-label-SPEAKER_0")).toHaveTextContent("Speaker 1");
  });

  it("prefers the confirmed name", () => {
    render(<SpeakerLabel speakerId="SPEAKER_1" speakerMap={{ SPEAKER_1: "Анна" }} />);
    expect(screen.getByTestId("speaker-label-SPEAKER_1")).toHaveTextContent("Анна");
  });
});
