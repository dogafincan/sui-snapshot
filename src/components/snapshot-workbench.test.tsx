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

describe("SnapshotWorkbench", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a concise initial form for the PANS coin type", () => {
    const runSnapshotBatch = vi.fn();
    const { container } = render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    expect((screen.getByLabelText("Coin address") as HTMLInputElement).value).toBe(PANS_COIN_TYPE);
    expect(screen.queryByText("Snapshot parameters")).toBeNull();
    expect(screen.queryByText("Inputs are normalized before the request is sent.")).toBeNull();
    expect(screen.queryByText("Ready to run")).toBeNull();
    expect(container.querySelector(".lucide-camera")).not.toBeNull();
  });

  it("renders an empty holder table before a snapshot is generated", () => {
    const runSnapshotBatch = vi.fn();
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);
    const holderDistribution = screen.getByText("Holder distribution");
    const tableControlRow = holderDistribution.parentElement?.parentElement;
    const filterField = screen.getByText("Filter by address").closest('[data-slot="field"]');
    const tablePagination = screen.getByRole("button", { name: "Previous" }).parentElement
      ?.parentElement;
    const tablePaginationClasses = tablePagination?.className.split(/\s+/) ?? [];
    const tableCard = holderDistribution.closest('[data-slot="card"]');

    expect(holderDistribution).toBeTruthy();
    expect(screen.getByText("0 holders across 1 page.")).toBeTruthy();
    expect(screen.getByText("Search the current snapshot.")).toBeTruthy();
    expect(screen.getByText("Rank")).toBeTruthy();
    expect(screen.getByText("Address")).toBeTruthy();
    expect(screen.getByText("Balance")).toBeTruthy();
    expect(screen.getByText("No holders match the current address filter.")).toBeTruthy();
    expect(screen.queryByText("Balance rank")).toBeNull();
    expect(screen.queryByRole("button", { name: "Address" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Balance" })).toBeNull();
    expect(tableControlRow?.className).toContain("lg:items-start");
    expect(tableControlRow?.className).toContain("lg:grid-cols-2");
    expect(tableControlRow?.className).not.toContain("lg:flex-row");
    expect(filterField?.className).not.toContain("lg:max-w-sm");
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
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

    fireEvent.change(screen.getByLabelText("Coin address"), {
      target: { value: "not-a-coin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("Validation error")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Coin address"), {
      target: { value: "0x2::sui::SUI" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Validation error")).toBeNull();
    });
  });

  it("marks existing results stale when the coin input changes after a snapshot", async () => {
    const runSnapshotBatch = vi.fn().mockResolvedValue(snapshotBatch());
    render(<SnapshotWorkbench runSnapshotBatch={runSnapshotBatch} />);

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

    fireEvent.click(screen.getByRole("button", { name: "Generate snapshot" }));

    expect(await screen.findByText("1 coin object scanned")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel snapshot" }));

    expect(await screen.findByText("Snapshot paused")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume snapshot" }).hasAttribute("disabled")).toBe(
      false,
    );
  });
});
