// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SnapshotWorkbench } from "@/components/snapshot-workbench";
import { normalizeCoinType, type SnapshotPageBatchResult } from "@/lib/sui-snapshot";

const ADDRESS_A = `0x${"a".repeat(64)}`;
const PANS_COIN_TYPE =
  "0xc9523f683256502be15ec4979098d510f67b6d3f0df02eebf124515014433270::pans::PANS";

function snapshotBatch(overrides?: Partial<SnapshotPageBatchResult>): SnapshotPageBatchResult {
  return {
    meta: {
      endpoint: "https://graphql.mainnet.sui.io/graphql",
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
    },
    balances: [{ address: ADDRESS_A, rawBalance: "5" }],
    cursor: null,
    nextCursor: null,
    decimals: 0,
    assetKind: "coin",
    pagesFetched: 1,
    objectsFetched: 1,
    ...overrides,
  };
}

function deferredSnapshotBatch() {
  let resolve!: (value: SnapshotPageBatchResult) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<SnapshotPageBatchResult>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function enterCoinAddress(value = PANS_COIN_TYPE) {
  fireEvent.change(screen.getByLabelText("Sui type"), {
    target: { value },
  });
}

describe("SnapshotWorkbench", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a concise initial form with a descriptive Sui type placeholder", () => {
    const runSnapshotBatch = vi.fn();
    const { container } = render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);
    const coinAddressInput = screen.getByLabelText("Sui type") as HTMLInputElement;
    const appTitle = screen.getByRole("heading", { level: 1, name: "Sui Snapshot" });
    const appSubtitle = screen.getByText(
      "Generate a ranked holder list for a Sui coin or NFT collection and export it as CSV.",
    );
    const appLogo = container.querySelector('[data-slot="app-logo"]');
    const appLogoForLightMode = appLogo?.querySelector('[data-slot="app-logo-for-light-mode"]');
    const appLogoForDarkMode = appLogo?.querySelector('[data-slot="app-logo-for-dark-mode"]');

    expect(appLogoForLightMode?.getAttribute("src")).toBe("/logo-dark.png");
    expect(appLogoForLightMode?.getAttribute("alt")).toBe("");
    expect(appLogoForDarkMode?.getAttribute("src")).toBe("/logo-light.png");
    expect(appLogoForDarkMode?.getAttribute("alt")).toBe("");
    expect(appTitle).toBeTruthy();
    expect(appSubtitle).toBeTruthy();
    expect(coinAddressInput.value).toBe("");
    expect(coinAddressInput.placeholder).toBe("Enter a Sui type");
    expect(screen.queryByText("Snapshot parameters")).toBeNull();
    expect(screen.queryByText("Inputs are normalized before the request is sent.")).toBeNull();
    expect(screen.queryByText("Ready to run")).toBeNull();
    expect(container.querySelector('[data-lucide="generate-snapshot"]')).not.toBeNull();
  });

  it("renders an empty holder table before a snapshot is generated", () => {
    const runSnapshotBatch = vi.fn();
    const { container } = render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);
    const rankedHolders = screen.getByText("Ranked holders");
    const tablePagination = screen.getByRole("button", { name: "Previous" }).parentElement
      ?.parentElement;
    const workbenchSection = container.querySelector('[data-slot="snapshot-workbench"]');
    const tableCard = rankedHolders.closest('[data-slot="card"]');
    const holderSummaryItem = rankedHolders.closest('[data-slot="item"]');
    const holderSummaryDescription = screen.getByText("0 holders across 1 page.");
    const generateButton = screen.getByRole("button", { name: "Generate snapshot" });
    const controls = container.querySelector('[data-slot="snapshot-controls"]');
    const formCard = generateButton.closest('[data-slot="card"]');

    expect(rankedHolders).toBeTruthy();
    expect(workbenchSection?.className).not.toContain("overflow-hidden");
    expect(workbenchSection?.className).toContain("min-w-0");
    expect(holderSummaryItem?.getAttribute("data-variant")).toBe("muted");
    expect(controls?.className).toContain("self-start");
    expect(controls?.className).toContain("lg:sticky");
    expect(controls?.className).toContain("lg:top-6");
    expect(formCard?.className).not.toContain("lg:sticky");
    expect(holderSummaryDescription).toBeTruthy();
    expect(screen.getByText("Rank")).toBeTruthy();
    expect(screen.getByText("Address")).toBeTruthy();
    expect(screen.getByText("Balance")).toBeTruthy();
    expect(screen.getByText("No holders to display.")).toBeTruthy();
    expect(screen.queryByText("Filter by address")).toBeNull();
    expect(screen.queryByText("Search the current snapshot.")).toBeNull();
    expect(screen.queryByLabelText("Filter holder table by address")).toBeNull();
    expect(screen.queryByText("No holders match the current address filter.")).toBeNull();
    expect(screen.queryByText("Holder distribution")).toBeNull();
    expect(screen.queryByText("Balance rank")).toBeNull();
    expect(screen.queryByRole("button", { name: "Address" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Balance" })).toBeNull();
    expect(tablePagination?.className).not.toContain("flex-col");
    expect(tableCard?.className).toContain("flex-1");
    expect(tableCard?.className).toContain("min-w-0");
    expect(screen.queryByText("Snapshot results")).toBeNull();
    expect(screen.queryByRole("button", { name: "Download CSV" })).toBeNull();
    expect(screen.getByRole("table").className).toContain("w-full");
    expect(screen.getByRole("table").className).not.toContain("w-max");
    expect(
      screen.getByText("Address").closest('[data-slot="table-head"]')?.className,
    ).not.toContain("min-w-[32rem]");
  });

  it("shows a required Sui type error for empty submissions and clears it on input", async () => {
    const runSnapshotBatch = vi.fn();
    const { container } = render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("Sui type required")).toBeTruthy();
    expect(screen.getByText("Enter a Sui type.")).toBeTruthy();
    expect(screen.queryByText("Invalid Sui type format")).toBeNull();
    const validationAlertIcon = container.querySelector('[data-lucide="validation-alert"]');

    expect(validationAlertIcon?.getAttribute("class")).toContain("lucide-circle-alert");
    expect(validationAlertIcon?.getAttribute("class")).not.toContain("lucide-triangle-alert");

    fireEvent.change(screen.getByLabelText("Sui type"), {
      target: { value: "0x2::sui::SUI" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Sui type required")).toBeNull();
    });
  });

  it("shows a format validation error for malformed Sui types", async () => {
    const runSnapshotBatch = vi.fn();
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    enterCoinAddress("not-a-coin");
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("Invalid Sui type format")).toBeTruthy();
    expect(screen.getByText("Enter a Sui type in 0xPACKAGE::MODULE::TYPE format.")).toBeTruthy();
    expect(screen.queryByText("Sui type required")).toBeNull();
    expect(
      document.querySelector('[data-lucide="validation-alert"]')?.getAttribute("class"),
    ).toContain("lucide-circle-alert");
  });

  it("shows a sanitized snapshot failure when the server returns an internal reference", async () => {
    const runSnapshotBatch = vi
      .fn()
      .mockRejectedValue(new Error("internal error; reference = 35mj9ufrun4toju14itug1kg"));
    const { container } = render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    enterCoinAddress();
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("Snapshot could not be generated")).toBeTruthy();
    expect(
      screen.getByText("Something went wrong while generating the snapshot. Please try again."),
    ).toBeTruthy();
    expect(screen.queryByText("Snapshot failed")).toBeNull();
    expect(screen.queryByText("internal error; reference = 35mj9ufrun4toju14itug1kg")).toBeNull();
    expect(
      container.querySelector('[data-lucide="snapshot-failed"]')?.getAttribute("class"),
    ).toContain("lucide-circle-alert");
  });

  it("keeps existing results without warning when the coin input changes after a snapshot", async () => {
    const runSnapshotBatch = vi.fn().mockResolvedValue(snapshotBatch());
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    enterCoinAddress();
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("1 holder across 1 page.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Sui type"), {
      target: { value: "0x3::foo::BAR" },
    });

    expect(screen.getByText("1 holder across 1 page.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeTruthy();
    expect(screen.queryByText("Input changed")).toBeNull();
    expect(screen.queryByText("Generate a new snapshot to refresh these results.")).toBeNull();
  });

  it("does not render summary cards after a snapshot", async () => {
    const runSnapshotBatch = vi.fn().mockResolvedValue(snapshotBatch());
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    enterCoinAddress();
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("1 holder across 1 page.")).toBeTruthy();
    expect(screen.queryByText("Holders")).toBeNull();
    expect(screen.queryByText("Total balance")).toBeNull();
    expect(screen.queryByText("CSV format")).toBeNull();
  });

  it("renders a loading skeleton that follows the ranked holders card structure", async () => {
    const deferredBatch = deferredSnapshotBatch();
    const runSnapshotBatch = vi.fn().mockReturnValue(deferredBatch.promise);
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    enterCoinAddress();
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    const loadingCard = await screen.findByRole("status", { name: "Loading ranked holders" });
    const summaryItem = loadingCard.querySelector('[data-slot="item"]');

    expect(loadingCard.getAttribute("data-slot")).toBe("card");
    expect(loadingCard.querySelector('[data-slot="card-header"]')).toBeNull();
    expect(summaryItem?.getAttribute("data-variant")).toBe("muted");
    expect(loadingCard.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(
      18,
    );
    expect(screen.queryByText("Snapshot results")).toBeNull();
    expect(screen.queryByText("Sui type:")).toBeNull();
    expect(screen.queryByRole("button", { name: "Download CSV" })).toBeNull();

    deferredBatch.resolve(snapshotBatch());

    expect(await screen.findByText("1 holder across 1 page.")).toBeTruthy();
  });

  it("renders snapshot results without redundant metadata and keeps the CSV action full-width", async () => {
    const coinAddress = normalizeCoinType(PANS_COIN_TYPE);
    const runSnapshotBatch = vi.fn().mockResolvedValue(snapshotBatch());
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    enterCoinAddress();
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("1 holder across 1 page.")).toBeTruthy();
    expect(screen.queryByText("Snapshot results")).toBeNull();
    expect(screen.queryByText("Sui type:")).toBeNull();
    expect(screen.queryByText(coinAddress)).toBeNull();
    expect(screen.queryByText("Holder snapshot")).toBeNull();
    expect(screen.getByRole("button", { name: "Download CSV" }).className).toContain("w-full");
    expect(screen.getByRole("button", { name: "Download CSV" }).className).not.toContain(
      "sm:w-auto",
    );
    expect(screen.getByText(ADDRESS_A).className).not.toContain("truncate");
    expect(screen.getByText(ADDRESS_A).closest('[data-slot="table-cell"]')?.className).toContain(
      "min-w-[32rem]",
    );
    expect(screen.getByRole("table").className).toContain("w-max");
    expect(screen.getByRole("table").className).toContain("min-w-full");
    expect(screen.getByRole("table").className).not.toContain("table-fixed");
  });

  it("can pause a multi-batch snapshot and offer to resume", async () => {
    const runSnapshotBatch = vi.fn().mockResolvedValueOnce(
      snapshotBatch({
        nextCursor: "cursor-1",
      }),
    );
    const { container } = render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    enterCoinAddress();
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("1 object scanned")).toBeTruthy();
    expect(container.querySelector('[data-lucide="cancel-snapshot"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel snapshot" }));

    const pausedTitle = await screen.findByText("Snapshot paused");
    const pausedAlert = pausedTitle.closest('[role="alert"]');
    const resumeButton = screen.getByRole("button", { name: "Resume snapshot" });

    expect(pausedTitle).toBeTruthy();
    expect(resumeButton.hasAttribute("disabled")).toBe(false);
    expect(container.querySelector('[data-lucide="snapshot-paused"]')).not.toBeNull();
    expect(
      resumeButton.compareDocumentPosition(pausedAlert as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows cancelling feedback while a cancellation is waiting for the active batch", async () => {
    const deferredBatch = deferredSnapshotBatch();
    const runSnapshotBatch = vi
      .fn()
      .mockResolvedValueOnce(
        snapshotBatch({
          nextCursor: "cursor-1",
        }),
      )
      .mockReturnValueOnce(deferredBatch.promise);
    const { container } = render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    enterCoinAddress();
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("1 object scanned")).toBeTruthy();
    await waitFor(
      () => {
        expect(runSnapshotBatch).toHaveBeenCalledTimes(2);
      },
      { timeout: 2_500 },
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel snapshot" }));

    const cancellingButton = await screen.findByRole("button", { name: "Cancelling snapshot" });
    const generateButton = screen.getByRole("button", { name: "Generate snapshot" });

    expect(generateButton.hasAttribute("disabled")).toBe(true);
    expect(container.querySelector('[data-lucide="generate-snapshot"]')).not.toBeNull();
    expect(container.querySelector('[data-lucide="snapshot-loading"]')).toBeNull();
    expect(cancellingButton.hasAttribute("disabled")).toBe(true);
    expect(container.querySelector('[data-lucide="snapshot-cancelling"]')).not.toBeNull();
    expect(screen.queryByText("Snapshot paused")).toBeNull();

    deferredBatch.resolve(
      snapshotBatch({
        cursor: "cursor-1",
        nextCursor: "cursor-2",
      }),
    );

    expect(await screen.findByText("Snapshot paused")).toBeTruthy();
  });
});
