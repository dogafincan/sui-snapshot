import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

describe("global styles", () => {
  it("uses the system color scheme for dark mode", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toContain("@media (prefers-color-scheme: dark)");
    expect(styles).toContain("color-scheme: light;");
    expect(styles).toContain("color-scheme: dark;");
    expect(styles).not.toContain("@custom-variant dark (&:is(.dark *));");
  });

  it("swaps the header logo for dark mode", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toContain('[data-slot="app-logo-for-light-mode"]');
    expect(styles).toContain('[data-slot="app-logo-for-dark-mode"]');
    expect(styles).toContain('.dark [data-slot="app-logo-for-light-mode"]');
    expect(styles).toContain('.dark [data-slot="app-logo-for-dark-mode"]');
  });

  it("uses a CSS-only mesh background that fades into the theme background", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const meshLayerStart = styles.indexOf("body::before");
    const meshLayerEnd = styles.indexOf("code {", meshLayerStart);
    const meshLayer = styles.slice(meshLayerStart, meshLayerEnd);

    expect(styles).toContain("--snapshot-hero-gradient-height: 600px;");
    expect(meshLayer).toContain("height: var(--snapshot-hero-gradient-height);");
    expect(meshLayer).toContain("radial-gradient");
    expect(meshLayer).toContain("linear-gradient(to bottom");
    expect(meshLayer).toContain("var(--background)");
    expect(meshLayer).not.toContain("url(");
  });
});
