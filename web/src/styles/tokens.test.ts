import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(
  resolve(process.cwd(), "src/styles/globals.css"),
  "utf8",
);

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token --${name} not found`);
  return m[1]!;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("ITSALT design tokens", () => {
  it("has no stock shadcn values", () => {
    expect(css).not.toMatch(/hsl\(/);
    expect(css).not.toMatch(/--radius:/);
  });

  it("defines radius tokens in the --radius-* namespace (rounded-md = 14px)", () => {
    expect(css).toMatch(/--radius-sm:\s*10px/);
    expect(css).toMatch(/--radius-md:\s*14px/);
    expect(css).toMatch(/--radius-lg:\s*20px/);
  });

  it("body text and text on primary meet WCAG AA (4.5:1)", () => {
    expect(
      contrast(token("color-foreground"), token("color-background")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(token("color-muted-foreground"), token("color-background")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(token("color-primary-foreground"), token("color-primary")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(token("color-primary-foreground"), token("color-primary-hover")),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
