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

## Reusable UI/UX Principles

Treat this app as a reusable reference for small, focused utility apps in this
workspace.

- Build the tool itself as the first screen. Do not add landing-page heroes,
  marketing copy, explainer cards, or decorative sections unless the product
  explicitly needs them.
- Keep the main workflow narrow. In this app that means: enter a Sui coin type,
  generate a ranked holder snapshot, optionally cancel or resume a long run,
  download the CSV, and leave.
- Remove UI that only explains the obvious. Summary metric cards,
  ready-to-run cards, snapshot-type pills, redundant metadata headers, table
  filtering, and table sorting were intentionally removed.
- Use a muted rounded workbench section as the main app surface. It should wrap
  the app's active cards, use padding that gives the cards room, and keep an
  outer radius that visually follows the inner card radius plus the gap between
  them.
- Use shadcn `base-luma`, Base UI primitives, Tailwind tokens, and Inter before
  inventing bespoke styling. Prefer neutral surfaces, subtle rings, and one
  strong primary action.
- Use typography deliberately. Page headers may be large and bold; card and item
  titles should be readable and semibold; descriptions should generally stay
  base-sized and not too thin.
- Keep copy concrete and user-facing. Prefer "Coin type", "Ranked holders",
  "Generate snapshot", "Download CSV", "Coin type required", and
  "Invalid coin type format" over vague or technical wording.
- Model async states explicitly. Loading skeletons should match the final card
  shape, cancelling should have its own button state, paused runs should appear
  below the resume action, and internal service errors should be sanitized.
- Design for every viewport. Preserve workbench and card borders on narrow
  screens, avoid layout overflow, and only use horizontal table scrolling when
  real rows require it.
- Respect system dark mode with the same structure and tokens. Do not add a
  manual theme switch unless requested.
- Use one icon family per app. For this app, product UI icons must come from
  `lucide-react`; use semantic icons and keep alert icons consistent.

## Important Files

- `src/routes/index.tsx`: app entry route
- `src/routes/__root.tsx`: root document and global app shell
- `src/components/snapshot-workbench.tsx`: page header, muted rounded workbench section, form workflow, initial empty table, loading states, and results card
- `src/components/holders-table.tsx`: static ranked holders table module with muted holder summary item and pagination
- `src/components/icon-system.test.ts`: regression guard that keeps product icons on Lucide
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
- Preserve the current product shape: header, rounded muted workbench, controls
  card, and holders card. The app should remain a focused utility, not a
  dashboard, report page, or marketing surface.
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
- Keep fetched and batched holder balances as raw base-unit strings until the
  final snapshot result is built. Aggregate with `BigInt` internally, serialize
  raw balances as strings between Worker calls, and format decimal display values
  only at the final table/CSV result boundary.
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
- Keep the workbench radius, padding, and inner card radius visually related at
  each breakpoint. If spacing tightens on smaller screens, the outer radius may
  need to tighten too.
- On large screens, keep the input card and results card top-aligned. The input
  card should sit inside a sticky wrapper without overflow clipping so it remains
  visible while the results card grows and the page scrolls.
- Use Lucide for all UI icons via `lucide-react`. Do not add Hugeicons or
  another icon package for product UI. Keep `components.json`, `package.json`,
  and `src/components/icon-system.test.ts` aligned with that rule.
- Keep the logo and favicon behavior theme-aware. The header logo uses the dark
  asset in light mode and the light asset in dark mode; favicons use media
  queries for light and dark variants.
- Keep loading, cancelling, paused, and error states calm and precise. When
  cancellation is pending, only the cancel button should show a cancelling
  loader; the generate button should remain disabled with its normal label and
  icon.
- Use direct, specific error copy. Required input, invalid format, and service
  failures should have distinct titles/descriptions. Internal server references
  should not be displayed directly to users.

## Testing Expectations

When changing behavior, run:

- `vp check`
- `vp test`
- `vp build`

For UI/UX changes, also check the relevant responsive states manually or with
browser automation when practical:

- empty initial state
- running/loading state
- cancelling state
- paused/resume state
- completed table and CSV action
- narrow and large widths
- light and dark system color schemes

If you change Worker bindings or env usage, also run:

- `vp run cf-typegen`

## Notes

- The original CLI script is intentionally gone; this repo is now app-first.
- Initial right-column content is the empty holders table. Summary cards,
  ready-to-run explainer cards, and snapshot-type pills were intentionally
  removed from the UI.
- The results card should center the holder table as the primary artifact. The
  ranked holder summary is a muted `Item`; the CSV action is full-width and below
  that summary after a snapshot completes.
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
