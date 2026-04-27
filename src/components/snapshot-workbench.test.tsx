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
    balances: [{ address: ADDRESS_A, balance: "5" }],
    cursor: null,
    nextCursor: null,
    decimals: 0,
    pagesFetched: 1,
    objectsFetched: 1,
    ...overrides,
  };
}

function enterCoinAddress(value = PANS_COIN_TYPE) {
  fireEvent.change(screen.getByLabelText("Coin address"), {
    target: { value },
  });
}

describe("SnapshotWorkbench", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a concise initial form with a descriptive coin type placeholder", () => {
    const runSnapshotBatch = vi.fn();
    const { container } = render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);
    const coinAddressInput = screen.getByLabelText("Coin address") as HTMLInputElement;

    expect(coinAddressInput.value).toBe("");
    expect(coinAddressInput.placeholder).toBe("Enter a Sui coin type");
    expect(screen.queryByText("Snapshot parameters")).toBeNull();
    expect(screen.queryByText("Inputs are normalized before the request is sent.")).toBeNull();
    expect(screen.queryByText("Ready to run")).toBeNull();
    expect(container.querySelector(".lucide-camera")).not.toBeNull();
  });

  it("renders an empty holder table before a snapshot is generated", () => {
    const runSnapshotBatch = vi.fn();
    const { container } = render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);
    const rankedHolders = screen.getByText("Ranked holders");
    const tablePagination = screen.getByRole("button", { name: "Previous" }).parentElement
      ?.parentElement;
    const tablePaginationClasses = tablePagination?.className.split(/\s+/) ?? [];
    const workbenchSection = container.querySelector('[data-slot="snapshot-workbench"]');
    const tableCard = rankedHolders.closest('[data-slot="card"]');
    const holderSummaryItem = rankedHolders.closest('[data-slot="item"]');

    expect(rankedHolders).toBeTruthy();
    expect(workbenchSection?.className).toContain("bg-muted");
    expect(workbenchSection?.className).toContain("rounded-[3rem]");
    expect(workbenchSection?.className).toContain("p-4");
    expect(workbenchSection?.className).toContain("sm:p-6");
    expect(holderSummaryItem?.getAttribute("data-variant")).toBe("muted");
    expect(holderSummaryItem?.className).toContain("bg-muted/50");
    expect(holderSummaryItem?.className).toContain("rounded-2xl");
    expect(screen.getByText("0 holders across 1 page.")).toBeTruthy();
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
    expect(tablePagination?.className).toContain("mt-auto");
    expect(tablePaginationClasses).toContain("flex-row");
    expect(tablePaginationClasses).toContain("items-center");
    expect(tablePaginationClasses).toContain("justify-between");
    expect(tablePaginationClasses).not.toContain("flex-col");
    expect(tableCard?.className).toContain("flex-1");
    expect(screen.queryByText("Snapshot results")).toBeNull();
    expect(screen.queryByRole("button", { name: "Download CSV" })).toBeNull();
  });

  it("clears validation errors when the coin input changes", async () => {
    const runSnapshotBatch = vi.fn();
    const { container } = render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("Check coin type")).toBeTruthy();
    expect(screen.getByText("Enter a coin type in 0xPACKAGE::MODULE::TOKEN format.")).toBeTruthy();
    expect(container.querySelector(".lucide-circle-alert")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Coin address"), {
      target: { value: "0x2::sui::SUI" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Check coin type")).toBeNull();
    });
  });

  it("marks existing results stale when the coin input changes after a snapshot", async () => {
    const runSnapshotBatch = vi.fn().mockResolvedValue(snapshotBatch());
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    enterCoinAddress();
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("Snapshot results")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Coin address"), {
      target: { value: "0x3::foo::BAR" },
    });

    expect(await screen.findByText("Input changed")).toBeTruthy();
    expect(screen.getByText("Generate a new snapshot to refresh these results.")).toBeTruthy();
  });

  it("does not render summary cards after a snapshot", async () => {
    const runSnapshotBatch = vi.fn().mockResolvedValue(snapshotBatch());
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    enterCoinAddress();
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("Snapshot results")).toBeTruthy();
    expect(screen.queryByText("Holders")).toBeNull();
    expect(screen.queryByText("Total balance")).toBeNull();
    expect(screen.queryByText("CSV format")).toBeNull();
  });

  it("renders a compact responsive snapshot results header", async () => {
    const coinAddress = normalizeCoinType(PANS_COIN_TYPE);
    const runSnapshotBatch = vi.fn().mockResolvedValue(snapshotBatch());
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    enterCoinAddress();
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("Snapshot results")).toBeTruthy();
    expect(screen.getByText("1 holder across 1 page.")).toBeTruthy();
    expect(screen.queryByText("Holder snapshot")).toBeNull();
    expect(screen.getByText(coinAddress).className).toContain("truncate");
    expect(screen.getByRole("button", { name: "Download CSV" }).className).toContain("w-full");
    expect(screen.getByRole("button", { name: "Download CSV" }).className).toContain("sm:w-auto");
  });

  it("can pause a multi-batch snapshot and offer to resume", async () => {
    const runSnapshotBatch = vi.fn().mockResolvedValueOnce(
      snapshotBatch({
        nextCursor: "cursor-1",
      }),
    );
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    enterCoinAddress();
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("1 coin object scanned")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel snapshot" }));

    expect(await screen.findByText("Snapshot paused")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume snapshot" }).hasAttribute("disabled")).toBe(
      false,
    );
  });
});
