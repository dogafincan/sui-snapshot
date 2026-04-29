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
});
