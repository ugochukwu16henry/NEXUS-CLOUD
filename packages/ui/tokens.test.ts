import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every theme must keep text readable on every surface it is drawn on (WCAG 2.2 AA: 4.5:1 for
// normal text). The themes are parsed from tokens.css itself, so this can't drift from the CSS.

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block in tokens.css`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/--color-nx-([a-z]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]),
  );
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const THEMES = {
  console: block("@theme"),
  hub: block('[data-theme="hub"]'),
  "hub-dark": block('[data-theme="hub-dark"]'),
};
const SURFACES = ["bg", "surface", "panel"] as const;
const TEXT = ["text", "muted", "teal", "blue", "ok", "warn", "danger"] as const;

describe.each(Object.entries(THEMES))("%s theme", (_name, colors) => {
  it("defines every token", () => {
    for (const token of [...SURFACES, "raised", "border", ...TEXT]) {
      expect(colors[token], token).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(SURFACES)("text colours meet AA on %s", (surface) => {
    for (const text of TEXT) {
      const ratio = contrast(colors[text]!, colors[surface]!);
      expect(ratio, `${text} on ${surface}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
