import { defineConfig } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const isVitest = process.env.VITEST === "true";
const enableTanStackDevtools = process.env.TANSTACK_DEVTOOLS === "true";
const mystenGraphQLDeps = ["@mysten/sui", "@mysten/sui/graphql", "@mysten/sui/graphql/schema"];

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
  environments: {
    // Avoid a dev-time SSR reload with mixed React optimizer versions when Vite discovers Devtools late.
    client: {
      optimizeDeps: {
        include: ["@tanstack/react-devtools"],
      },
    },
    ssr: {
      optimizeDeps: {
        exclude: mystenGraphQLDeps,
        include: ["@tanstack/react-devtools"],
      },
    },
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
