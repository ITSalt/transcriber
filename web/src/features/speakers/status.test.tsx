import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/routes/catalog/components/StatusBadge";
import i18n from "@/i18n/config";

describe("AWAITING_SPEAKERS status label", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it.each([
    ["en", "Awaiting speakers"],
    ["ru", "Ожидает подтверждения спикеров"],
  ])("is shown in %s", async (lang, label) => {
    await i18n.changeLanguage(lang);
    render(<StatusBadge status="AWAITING_SPEAKERS" />);
    expect(screen.getByTestId("status-badge-AWAITING_SPEAKERS")).toHaveTextContent(label);
  });

  it("does not pulse: it waits for the user, not for a job", async () => {
    render(<StatusBadge status="AWAITING_SPEAKERS" />);
    expect(screen.getByTestId("status-badge-AWAITING_SPEAKERS").className).not.toContain(
      "animate-pulse",
    );
  });
});
