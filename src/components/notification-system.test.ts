import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

function productionSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return productionSourceFiles(path);
    }

    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("notification system", () => {
  it("keeps toast notifications out of the app", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const packageLock = readFileSync("package-lock.json", "utf8");
    const sourceFilesWithSonnerImports = productionSourceFiles("src").filter((path) => {
      const source = readFileSync(path, "utf8");
      return /from\s+["']sonner["']|components\/ui\/sonner/.test(source);
    });
    const sonnerWrapperFiles = productionSourceFiles("src").filter((path) =>
      path.endsWith(join("ui", "sonner.tsx")),
    );

    expect(packageJson.dependencies?.sonner).toBeUndefined();
    expect(packageJson.devDependencies?.sonner).toBeUndefined();
    expect(packageLock).not.toContain('"node_modules/sonner"');
    expect(sourceFilesWithSonnerImports).toEqual([]);
    expect(sonnerWrapperFiles).toEqual([]);
  });
});
