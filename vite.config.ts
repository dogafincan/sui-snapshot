import { defineConfig } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const isVitest = process.env.VITEST === "true";
const enableTanStackDevtools = process.env.TANSTACK_DEVTOOLS === "true";

const config = defineConfig({
  fmt: {
    ignorePatterns: ["dist/**", "src/routeTree.gen.ts", "worker-configuration.d.ts"],
  },
  lint: {
    ignorePatterns: ["dist/**", "src/routeTree.gen.ts", "worker-configuration.d.ts"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom"],
  },
  plugins: [
    ...(enableTanStackDevtools ? [devtools()] : []),
    ...(isVitest ? [] : [cloudflare({ viteEnvironment: { name: "ssr" } })]),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
