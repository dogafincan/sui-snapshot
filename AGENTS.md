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

- Vite+
- TanStack Start
- TanStack Router
- TanStack Table
- React 19
- shadcn/ui on Base UI primitives
- shadcn preset `b1aIaos55` on `base-luma`
- Tailwind CSS v4
- Inter variable font
- Hugeicons for preset-managed icons
- Cloudflare Workers via `@cloudflare/vite-plugin`

## Important Files

- `src/routes/index.tsx`: app entry route
- `src/routes/__root.tsx`: root document and global app shell
- `src/components/snapshot-workbench.tsx`: page layout, form workflow, loading states, and results card
- `src/components/holders-table.tsx`: live table module with sorting, filtering, and pagination
- `src/components/ui/field.tsx`: shadcn field composition for form structure
- `src/lib/sui-snapshot.server.ts`: server-side snapshot execution
- `src/lib/sui-snapshot.functions.ts`: TanStack Start server function wrapper
- `src/lib/sui-snapshot.ts`: shared validation, formatting, CSV, and allocation helpers
- `wrangler.jsonc`: Cloudflare Worker config

## Generated Files

Do not hand-edit these unless there is a specific reason and you know the generator flow:

- `src/routeTree.gen.ts`
- `worker-configuration.d.ts`

Regenerate them with the normal toolchain when needed:

- `vp dev`
- `vp build`
- `vp run cf-typegen`

## Local Commands

- `vp env setup`
- `vp install`
- `vp dev`
- `vp check`
- `vp test`
- `vp build`
- `vp preview --host 127.0.0.1`
- `vp run deploy`
- `vp run cf-typegen`

Compatibility wrappers remain in `package.json`, but Vite+ commands are the
primary workflow.

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
- Keep Vite+ as the primary toolchain. Prefer configuring format, lint, test,
  and task behavior in `vite.config.ts` instead of separate tool config files.
- Use existing shadcn components before introducing custom primitives.
- Preserve the current visual contract: stock shadcn `base-luma` styling with the
  applied preset, Inter, and Base UI primitives. Prefer minimal layout classes and
  avoid custom shells, decorative chrome, or bespoke visual styling.

## Testing Expectations

When changing behavior, run:

- `vp check`
- `vp test`
- `vp build`

If you change Worker bindings or env usage, also run:

- `vp run cf-typegen`

## Notes

- The original CLI script is intentionally gone; this repo is now app-first.
- Snapshot accuracy is still based on live pagination over Sui GraphQL, so it
  can drift slightly during execution.
- Generated files `src/routeTree.gen.ts` and `worker-configuration.d.ts` are
  excluded from Vite+ formatting and linting.
- This repo does not manage Vite+ commit hooks, editor scaffolding, or agent
  scaffolding.
