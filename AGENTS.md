# AGENTS.md

## Project Overview

This repository is a TanStack Start web app deployed to Cloudflare Workers.
It replaces the original one-off CLI script with a browser UI plus a server
function that runs the Sui holder snapshot logic on demand.

Core behavior:

- Query Sui GraphQL RPC for live `Coin<T>` objects for a token type in
  Worker-safe page batches.
- Aggregate non-zero balances by owner address.
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
- Lucide for all UI icons
- Cloudflare Workers via `@cloudflare/vite-plugin`

## Important Files

- `src/routes/index.tsx`: app entry route
- `src/routes/__root.tsx`: root document and global app shell
- `src/components/snapshot-workbench.tsx`: page header, muted rounded workbench section, form workflow, initial empty table, loading states, and results card
- `src/components/holders-table.tsx`: static ranked holders table module with muted holder summary item and pagination
- `src/components/ui/field.tsx`: shadcn field composition for form structure
- `src/components/ui/item.tsx`: shadcn item composition for muted inner content blocks
- `src/lib/sui-snapshot.server.ts`: server-side snapshot execution
- `src/lib/sui-snapshot.functions.ts`: TanStack Start server function wrapper
- `src/lib/sui-snapshot.ts`: shared validation, formatting, and CSV helpers
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

- `http://localhost:5173`

The npm compatibility wrapper `npm run dev` pins the dev server to:

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
  - input: `coinAddress`
  - output: ranked non-zero rows with `rank`, `address`, and `balance`
- Keep the holders table visible before a snapshot exists by rendering the table
  with empty rows. Only show CSV download controls after a snapshot has
  completed; do not render separate snapshot metadata in the results card. Empty
  tables should fill their container without horizontal scrolling.
- Keep the holders table static after rows are returned. Do not add client-side
  sorting or filtering unless explicitly requested; the returned ranked order is
  the table order. Preserve full address and balance text in populated table
  cells; narrow screens should use horizontal table scrolling instead of
  ellipses once rows exist.
- Preserve the canonical CSV contract: `rank,address,balance`. Do not add
  airdrop amount columns here; airdrop amounts are chosen exclusively in
  `sui-airdrop`.
- Keep transport values server-to-client JSON-safe. Do not send `BigInt`
  objects across the boundary.
- Prefer putting reusable pure logic in `src/lib/sui-snapshot.ts` so it stays
  easy to unit test.
- Prefer keeping Cloudflare-specific runtime code in server-only modules.
- Keep Vite+ as the primary toolchain. Prefer configuring format, lint, test,
  and task behavior in `vite.config.ts` instead of separate tool config files.
- Use existing shadcn components before introducing custom primitives.
- Preserve the current visual contract: stock shadcn `base-luma` styling with the
  applied preset, Inter, and Base UI primitives. The snapshot controls and holder
  table live inside a muted rounded workbench section containing shadcn cards, and
  compact inner summaries should use the shadcn `Item` muted variant. Prefer
  readable base-size card copy, semibold section titles, and a strong page
  header. Prefer minimal layout classes and avoid non-shadcn decorative chrome or
  bespoke visual styling.
- On large screens, keep the input card and results card top-aligned. The input
  card should sit inside a sticky wrapper without overflow clipping so it remains
  visible while the results card grows and the page scrolls.
- Use Lucide for all UI icons via `lucide-react`. Do not add Hugeicons or
  another icon package for product UI.

## Testing Expectations

When changing behavior, run:

- `vp check`
- `vp test`
- `vp build`

If you change Worker bindings or env usage, also run:

- `vp run cf-typegen`

## Notes

- The original CLI script is intentionally gone; this repo is now app-first.
- Initial right-column content is the empty holders table. Summary cards,
  ready-to-run explainer cards, and snapshot-type pills were intentionally
  removed from the UI.
- Snapshot accuracy is based on live pagination over Sui GraphQL RPC, so it can
  drift slightly while large holder sets are scanned.
- Zero-balance coin objects are excluded from holder counts, table rows, and CSV
  exports.
- Large holder sets are fetched across multiple server calls so each Worker
  invocation stays below the Workers Free subrequest limit, while coin metadata
  is carried across batches to avoid redundant requests.
- Generated files `src/routeTree.gen.ts` and `worker-configuration.d.ts` are
  excluded from Vite+ formatting and linting.
- This repo does not manage Vite+ commit hooks, editor scaffolding, or agent
  scaffolding.
