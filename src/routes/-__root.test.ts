import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

describe("RootDocument head", () => {
  it("declares one app manifest and shared favicon assets", () => {
    const source = readFileSync(new URL("./__root.tsx", import.meta.url), "utf8");
    const manifest = readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8");

    expect(source).toContain('rel: "manifest"');
    expect(source).toContain('href: "/manifest.json"');
    expect(source).toContain('href: "/favicon.ico"');
    expect(source).toContain('href: "/favicon-16x16.png"');
    expect(source).toContain('href: "/favicon-32x32.png"');
    expect(source).toContain('rel: "apple-touch-icon"');
    expect(source).toContain('href: "/apple-touch-icon.png"');
    expect(source).not.toContain("favicon-light");
    expect(source).not.toContain("favicon-dark");
    expect(source).not.toContain("prefers-color-scheme");
    expect(manifest).toContain('"/android-chrome-192x192.png"');
    expect(manifest).toContain('"/android-chrome-512x512.png"');
    expect(manifest).not.toContain('"/icon-192.png"');
    expect(manifest).not.toContain('"/icon-512.png"');
  });
});
