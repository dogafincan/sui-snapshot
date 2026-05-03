# Sui Snapshot

TanStack Start web app for running Sui coin and NFT collection holder snapshots
on Cloudflare Workers.

The app:

- scans Sui GraphQL RPC for live `Coin<T>` objects or NFT collection objects in
  Worker-safe page batches,
- aggregates non-zero coin balances or NFT counts by owner address,
- resolves object-owned NFTs through Sui object ownership, personal kiosks, and
  standard kiosk owner caps without a third-party indexer,
- keeps an empty holders table visible before the first run,
- renders the full result set in a paginated table after a snapshot completes,
- exports the same rows as CSV without rerunning the snapshot.

## Toolchain

This repo now uses Vite+ as the primary local toolchain while keeping the same
TanStack Start and Cloudflare Workers architecture.

Primary workflow:

- install Vite+ once if needed
- run `npx vp env setup`
- run `npx vp install`
- use `npx vp dev`, `npx vp check`, `npx vp test`, and `npx vp build`
- use `npx vp run deploy` and `npx vp run cf-typegen` for Wrangler-specific repo tasks

Invoke Vite+ through `npx vp ...` so the repo-local CLI is used even when `vp`
is not on the shell `PATH`.

## What It Does

Input:

- Sui type in `0xPACKAGE::MODULE::TYPE` format. This can be either a coin type
  such as `0x2::sui::SUI` or an NFT object type such as
  `0xPACKAGE::collection::Nft`.

Output:

- empty holder table before the first snapshot
- ranked non-zero holder table
- client-side CSV download with exactly `rank,address,balance`
- CSV filename in
  `${packageSuffix || "holders"}-${moduleName}-${tokenName}-snapshot.csv` format

For coins, `balance` is the final decimal balance. For NFT collections,
`balance` is the number of collection objects resolved to that holder.

The filename is assembled in `src/components/snapshot-workbench.helpers.ts`.
`packageSuffix` is the last 12 hex characters of the normalized package address,
after removing the leading `0x`. For example, `0x2::sui::SUI` downloads as
`000000000002-sui-SUI-snapshot.csv`. The package suffix keeps downloads
distinguishable when different packages use the same module and type names.

## Design And UX Direction

This app is also a reference for the kind of small, focused utilities this
workspace should produce. The UI is intentionally product-like and operational,
not a marketing page.

Reusable principles:

- Put the actual tool on the first screen. Avoid landing-page framing,
  explanatory cards, and decorative sections when the user is here to complete a
  task.
- Keep the workflow narrow and obvious: enter a Sui type, generate the
  snapshot, optionally cancel or resume a long run, download the CSV, and leave.
- Make every visible element earn its place. Removed patterns include
  ready-to-run explainers, snapshot-type pills, summary metric cards, snapshot
  metadata headers, client-side sorting, and filtering.
- Use a rounded muted workbench section as the main app surface. It should
  contain shadcn cards, have enough padding to make the inner cards feel nested,
  and use an outer radius that visually relates to the card radius and spacing.
- Use stock shadcn `base-luma` primitives and tokens before inventing custom
  styling. Prefer neutral surfaces, subtle rings, and a small number of strong
  action buttons over bespoke decoration.
- Keep typography readable and confident: Inter, a strong page title, concise
  medium-weight subtitle, semibold field and section titles, and base-size card
  descriptions. Avoid tiny or thin text for primary workflows.
- Design state changes explicitly. Loading skeletons should mirror the final
  card structure; cancellation should have its own state; paused runs should
  appear below the resume action; errors should be short, specific, and use a
  consistent icon.
- Support all viewport widths at all times. On large screens the controls and
  results cards are top-aligned, with the controls sticky while results scroll.
  On narrow screens, preserve card and workbench borders and prevent content
  from escaping.
- Keep empty and populated tables visually different where it matters. Empty
  tables fill their container without horizontal scrolling; populated tables
  preserve full addresses and balances through horizontal scrolling instead of
  ellipses.
- Respect system dark mode without adding a manual mode switch. Light and dark
  variants should use the same structure and tokens, with only the needed asset
  or token changes.
- Use Lucide for all product UI icons. Keep icons semantic and consistent:
  camera for snapshot generation, loader for active work, circle alert for
  errors, pause for paused work, refresh for resume, and download for CSV.

## Stack

- TanStack Start
- Cloudflare Workers via `@cloudflare/vite-plugin`
- shadcn/ui on Base UI primitives
- preset `b1aIaos55` on `base-luma`
- Tailwind CSS v4
- Inter variable font
- Lucide for all UI icons
- `@mysten/sui` typed GraphQL client
- Vite+

## Project Structure

- `src/routes/index.tsx`: route entrypoint for `/`
- `src/routes/__root.tsx`: root document and global app shell
- `src/components/snapshot-workbench.tsx`: page header, muted rounded workbench section, form, initial empty table, loading states, and results card
- `src/components/snapshot-workbench.helpers.ts`: form input assembly and CSV download filename/content helper
- `src/components/use-snapshot-runner.ts`: client-side snapshot orchestration hook for validation, batching, cancellation, pause/resume, result assembly, CSV download, and request errors
- `src/components/holders-table.tsx`: static ranked holders table, local pagination, and muted holder summary item
- `src/components/icon-system.test.ts`: regression test that keeps product icons on Lucide
- `src/components/ui/field.tsx`: shadcn field composition used for form layout
- `src/components/ui/item.tsx`: shadcn item composition used for muted inner content blocks
- `src/lib/sui-snapshot.server.ts`: typed Sui GraphQL holder page-batch execution
- `src/lib/sui-snapshot.functions.ts`: TanStack Start server function wrapper
- `src/lib/sui-snapshot.ts`: shared validation, formatting, and CSV helpers
- `wrangler.jsonc`: Cloudflare Worker configuration

## Snapshot Pipeline

The server first tries to read coin metadata for the submitted Sui type. If coin
metadata exists, the input is treated as a coin and the app scans live
`0x2::coin::Coin<T>` objects. Coin objects expose address ownership and raw
base-unit balances, so each page can be aggregated directly.

If coin metadata does not exist, the input is treated as an NFT/object
collection type. The app scans live objects whose type exactly matches the
submitted type. Each object counts as one unit.

NFT ownership can be indirect:

- address-owned NFT objects are counted directly for that address,
- object-owned NFT objects are followed through their owner object chain,
- personal-kiosk NFTs are resolved through the personal kiosk owner marker,
- standard-kiosk NFTs are resolved by discovering the matching `KioskOwnerCap`
  and reading that cap object's current owner.

This is intentionally indexer-free. The app does not call SuiScan, Blockberry, or
another third-party indexing API for NFT holder resolution. It derives the
snapshot from current Sui GraphQL RPC object state. Do not use the kiosk move
object `json.owner` field as the holder source of truth; it can be stale after
transfers.

Coin pages currently request 50 objects per Sui GraphQL page. NFT pages request
10 objects per Worker batch because resolving kiosk ownership can require
additional GraphQL subrequests per NFT. That lower page size is a Cloudflare
subrequest-budget choice, not a Sui protocol maximum.

Generated files:

- `src/routeTree.gen.ts`
- `worker-configuration.d.ts`

These are generated by the framework/tooling and should not be treated as normal hand-edited source files.

## Run Locally

1. Install Vite+ and set up its environment:

   ```bash
   curl -fsSL https://vite.plus | bash
   npx vp env setup
   ```

2. Install dependencies:

   ```bash
   npx vp install
   ```

3. Start the local dev server:

   ```bash
   npx vp dev
   ```

4. Open [http://localhost:5173](http://localhost:5173).

Production-style local preview:

```bash
npx vp preview --host 127.0.0.1
```

That serves the built app on `http://127.0.0.1:4173`.

The default Sui GraphQL endpoint is `https://graphql.mainnet.sui.io/graphql`.

Optional endpoint override:

```bash
SUI_GRAPHQL_ENDPOINT="https://graphql.mainnet.sui.io/graphql"
```

Optional batch budget overrides:

```bash
SUI_GRAPHQL_MAX_SUBREQUESTS="50"
SUI_GRAPHQL_RETRY_HEADROOM="10"
```

Keep local overrides in `.dev.vars`. Deployed overrides can be configured as
Cloudflare Worker environment variables when needed.

## Scripts

- `npx vp dev` starts the local TanStack Start dev server on its default port,
  usually `5173`.
- `npx vp check` runs formatting, linting, and type checking through Vite+.
- `npx vp test` runs the test suite through Vite+.
- `npx vp build` builds client and server bundles for Workers.
- `npx vp preview` serves the production bundle locally.
- `npx vp run deploy` builds and deploys with Wrangler.
- `npx vp run cf-typegen` regenerates `worker-configuration.d.ts` from `wrangler.jsonc`.

Compatibility wrappers still exist in `package.json` for npm-based workflows:

- `npm run dev`
- `npm run check`
- `npm run test`
- `npm run build`
- `npm run preview`
- `npm run deploy`
- `npm run cf-typegen`

`npm run dev` pins the local dev server to port `3000` for compatibility with
older local workflows.

## Deployment

Deploy to Cloudflare Workers with:

```bash
npx vp run deploy
```

The Worker entrypoint is `@tanstack/react-start/server-entry`, configured in
`wrangler.jsonc`.

For Cloudflare Workers Builds, use:

- build command: `npm run build`
- deploy command: `npx wrangler deploy`

Those npm commands call the same Vite+ build and Wrangler deployment path used
locally.

## Verification

Useful checks before deploying:

```bash
npx vp check
npx vp test
npx vp build
npx vp run cf-typegen
```

## Notes

- The app is stateless and public by design. No D1, KV, R2, or background jobs.
- The exported CSV contract is intentionally fixed to `rank,address,balance` so
  it can be uploaded directly into the sibling `sui-airdrop` app.
- CSV download filenames include the package suffix, module name, and token type
  as `${packageSuffix || "holders"}-${moduleName}-${tokenName}-snapshot.csv`.
  Keep the package suffix or an equivalent package identifier so same-named
  modules and types from different packages do not collide in users' downloads.
- Internally, fetched and batched balances stay as raw base-unit strings.
  Snapshot assembly aggregates those values with `BigInt` and formats decimal
  balances only for the final table and CSV output.
- The app's UI/UX decisions are intentionally documented here so future apps can
  reuse the same taste: focused first screen, clear workbench surface, restrained
  shadcn components, readable typography, explicit async states, responsive
  tables, system dark mode, and one icon family.
- Vite+ is the primary toolchain. `vite.config.ts` is the source of truth for
  format, lint, test, and build configuration.
- Generated files such as `src/routeTree.gen.ts` and `worker-configuration.d.ts`
  are excluded from Vite+ formatting and linting.
- The UI is intentionally constrained to stock shadcn `base-luma` styling with the
  applied preset. The main snapshot area is a muted rounded workbench section
  containing shadcn cards, and the table summary uses the shadcn `Item` muted
  variant. Current typography favors readable base-size card copy, semibold
  section titles, and a strong page header. Prefer stock shadcn components and
  minimal layout classes.
  Avoid non-shadcn decorative chrome or bespoke visual treatments.
- Use Lucide for all UI icons via `lucide-react`. Do not add Hugeicons or
  another icon package for product UI.
- On large screens, keep the input card and results card top-aligned. The input
  card should sit inside a sticky wrapper without overflow clipping so it remains
  visible while the taller results card scrolls.
- The holders table is intentionally visible before a snapshot exists. Keep that
  initial state empty, without snapshot metadata, CSV controls, summary cards, or
  explanatory placeholder cards. Empty tables should occupy the available width
  without horizontal scrolling.
- Completed snapshots should keep the holders table as the main results surface.
  Do not add a separate snapshot metadata header; place the full-width CSV action
  below the ranked holders summary.
- Loading, cancelling, paused, and error states are part of the product
  experience. Keep them visually calm and specific. In particular, when
  cancellation is pending, only the cancel button should show the cancelling
  loader; the generate button should remain disabled with its normal label.
- The holders table intentionally has no client-side sorting or filtering. Keep
  rows in the returned ranked order. Once rows exist, keep full address and
  balance values available through horizontal table scrolling instead of
  truncating them.
- Snapshot accuracy is based on live pagination over Sui GraphQL RPC, so it can
  drift slightly while large holder sets are scanned.
- Zero-balance coin objects are excluded from holder counts, table rows, and CSV
  exports. NFT collection objects count as one unit each.
- Object-owned NFTs are resolved without a third-party indexer. The server
  follows object ownership to kiosks, reads personal kiosk owner markers when
  present, and otherwise resolves the current owner of the matching
  `KioskOwnerCap`. Do not use the kiosk move object `json.owner` field as the
  source of truth; it can be stale after transfers.
- Large holder sets are fetched across multiple server calls so each Worker
  invocation stays below the configured subrequest ceiling. The server computes
  each batch's page budget from `SUI_GRAPHQL_MAX_SUBREQUESTS`, metadata request
  cost, and `SUI_GRAPHQL_RETRY_HEADROOM`; coin metadata is carried across
  batches to avoid redundant requests. NFT/object snapshots intentionally use a
  smaller page size because owner resolution can require extra Sui GraphQL reads.
- The original CLI script has been removed; this repository is now web-app-first.
