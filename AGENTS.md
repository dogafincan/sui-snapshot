# AGENTS.md

## Project Overview

This repository is a TanStack Start web app deployed to Cloudflare Workers.
It replaces the original one-off CLI script with a browser UI plus a server
function that runs the Sui holder snapshot logic on demand.

Core behavior:

- Query Sui GraphQL for all live `Coin<T>` objects for a token type.
- Aggregate balances by owner address.
- Optionally compute proportional airdrop allocations with exclusions.
- Render the result in a TanStack Table UI.
- Export the returned rows as CSV client-side.

## Stack

- TanStack Start
- TanStack Router
- TanStack Table
- React 19
- shadcn/ui
- Tailwind CSS v4
- Cloudflare Workers via `@cloudflare/vite-plugin`
- Vitest

## Important Files

- `src/routes/index.tsx`: app entry route
- `src/components/snapshot-workbench.tsx`: main page UI and form workflow
- `src/components/holders-table.tsx`: TanStack Table setup and client-side table behavior
- `src/lib/sui-snapshot.server.ts`: server-side snapshot execution
- `src/lib/sui-snapshot.functions.ts`: TanStack Start server function wrapper
- `src/lib/sui-snapshot.ts`: shared validation, formatting, CSV, and allocation helpers
- `wrangler.jsonc`: Cloudflare Worker config

## Generated Files

Do not hand-edit these unless there is a specific reason and you know the generator flow:

- `src/routeTree.gen.ts`
- `worker-configuration.d.ts`

Regenerate them with the normal toolchain when needed:

- `npm run dev`
- `npm run build`
- `npm run cf-typegen`

## Local Commands

- `npm install`
- `npm run dev`
- `npm run test`
- `npm run build`
- `npm run preview -- --host 127.0.0.1`
- `npm run deploy`

Default local URL:

- `http://localhost:3000`

Preview URL:

- `http://127.0.0.1:4173`

## Environment

The app defaults to:

- `https://graphql.mainnet.sui.io/graphql`

Optional override:

- `SUI_GRAPHQL_ENDPOINT`

If you add more Worker env vars, keep them documented in `README.md` and
aligned with `wrangler.jsonc`.

## Editing Guidance

- Keep the app stateless. Do not introduce D1, KV, R2, queues, or persistence
  unless explicitly requested.
- Preserve the current public interface:
  - route `/`
  - input: `coinAddress`, optional `airdropAmount`, optional exclusions
  - output: ranked rows plus optional airdrop column
- Keep transport values server-to-client JSON-safe. Do not send `BigInt`
  objects across the boundary.
- Prefer putting reusable pure logic in `src/lib/sui-snapshot.ts` so it stays
  easy to unit test.
- Prefer keeping Cloudflare-specific runtime code in server-only modules.
- Use existing shadcn components before introducing custom primitives.

## Testing Expectations

When changing behavior, run:

- `./node_modules/.bin/tsc --noEmit`
- `npm test`
- `npm run build`

If you change Worker bindings or env usage, also run:

- `npm run cf-typegen`

## Notes

- The original CLI script is intentionally gone; this repo is now app-first.
- Snapshot accuracy is still based on live pagination over Sui GraphQL, so it
  can drift slightly during execution.
