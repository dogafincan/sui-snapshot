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
