import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

describe("index route head", () => {
  it("declares Open Graph and Twitter metadata with a 1200x630 image", () => {
    const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
    const ogImage = readFileSync(new URL("../../public/og-image.png", import.meta.url));

    expect(source).toContain('property: "og:type"');
    expect(source).toContain('property: "og:title"');
    expect(source).toContain('property: "og:description"');
    expect(source).toContain('property: "og:image"');
    expect(source).toContain('const SOCIAL_IMAGE = "/og-image.png";');
    expect(source).toContain("content: SOCIAL_IMAGE");
    expect(source).toContain('property: "og:image:width"');
    expect(source).toContain('content: "1200"');
    expect(source).toContain('property: "og:image:height"');
    expect(source).toContain('content: "630"');
    expect(source).toContain('name: "twitter:card"');
    expect(source).toContain('content: "summary_large_image"');
    expect(source).toContain('name: "twitter:image"');

    expect(ogImage.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(ogImage.readUInt32BE(16)).toBe(1200);
    expect(ogImage.readUInt32BE(20)).toBe(630);
  });
});
