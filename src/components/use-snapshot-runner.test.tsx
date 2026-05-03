// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useSnapshotRunner } from "@/components/use-snapshot-runner";
import { normalizeCoinType, type SnapshotPageBatchResult } from "@/lib/sui-snapshot";

const ADDRESS_A = `0x${"a".repeat(64)}`;
const ADDRESS_B = `0x${"b".repeat(64)}`;

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

describe("useSnapshotRunner", () => {
  afterEach(() => {
    cleanup();
  });

  it("assembles a snapshot across batches", async () => {
    const notifySuccess = vi.fn();
    const notifyError = vi.fn();
    const runSnapshotBatch = vi
      .fn()
      .mockResolvedValueOnce(
        snapshotBatch({
          balances: [{ address: ADDRESS_A, rawBalance: "5" }],
          nextCursor: "cursor-1",
        }),
      )
      .mockResolvedValueOnce(
        snapshotBatch({
          balances: [{ address: ADDRESS_B, rawBalance: "7" }],
          cursor: "cursor-1",
          nextCursor: null,
        }),
      );

    const { result } = renderHook(() =>
      useSnapshotRunner({
        batchPauseMs: 0,
        notifyError,
        notifySuccess,
        runSnapshotBatch,
      }),
    );

    act(() => {
      result.current.changeCoinAddress("0x2::sui::SUI");
    });

    await act(async () => {
      await result.current.submitSnapshot();
    });

    expect(runSnapshotBatch).toHaveBeenCalledTimes(2);
    expect(result.current.snapshot?.rows).toEqual([
      { rank: 1, address: ADDRESS_B, balance: "7" },
      { rank: 2, address: ADDRESS_A, balance: "5" },
    ]);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.snapshotProgress).toBeNull();
    expect(notifySuccess).toHaveBeenCalledWith("Loaded 2 holders.");
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("carries NFT collection mode across later batches", async () => {
    const notifySuccess = vi.fn();
    const notifyError = vi.fn();
    const nftType =
      "0x6eabd37ba3e9915b8e0490c4454532909a1282f6dfa6898eb6f3bee7ae58b453::random_panda_club::Nft";
    const normalizedNftType = normalizeCoinType(nftType);
    const runSnapshotBatch = vi
      .fn()
      .mockResolvedValueOnce(
        snapshotBatch({
          meta: {
            endpoint: "https://graphql.mainnet.sui.io/graphql",
            coinAddress: normalizedNftType,
          },
          balances: [{ address: ADDRESS_A, rawBalance: "2" }],
          assetKind: "object",
          nextCursor: "cursor-1",
        }),
      )
      .mockResolvedValueOnce(
        snapshotBatch({
          meta: {
            endpoint: "https://graphql.mainnet.sui.io/graphql",
            coinAddress: normalizedNftType,
          },
          balances: [{ address: ADDRESS_B, rawBalance: "1" }],
          assetKind: "object",
          cursor: "cursor-1",
          nextCursor: null,
        }),
      );

    const { result } = renderHook(() =>
      useSnapshotRunner({
        batchPauseMs: 0,
        notifyError,
        notifySuccess,
        runSnapshotBatch,
      }),
    );

    act(() => {
      result.current.changeCoinAddress(nftType);
    });

    await act(async () => {
      await result.current.submitSnapshot();
    });

    expect(runSnapshotBatch).toHaveBeenNthCalledWith(2, {
      data: {
        coinAddress: normalizedNftType,
        cursor: "cursor-1",
        decimals: 0,
        assetKind: "object",
      },
    });
    expect(result.current.snapshot?.rows).toEqual([
      { rank: 1, address: ADDRESS_A, balance: "2" },
      { rank: 2, address: ADDRESS_B, balance: "1" },
    ]);
    expect(notifySuccess).toHaveBeenCalledWith("Loaded 2 holders.");
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("hides implementation details from request errors", async () => {
    const notifySuccess = vi.fn();
    const notifyError = vi.fn();
    const runSnapshotBatch = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useSnapshotRunner({
        notifyError,
        notifySuccess,
        runSnapshotBatch,
      }),
    );

    act(() => {
      result.current.changeCoinAddress("0x2::sui::SUI");
    });

    await act(async () => {
      await result.current.submitSnapshot();
    });

    expect(result.current.requestError).toEqual({
      title: "Snapshot could not be generated",
      description: "Something went wrong while generating the snapshot. Please try again.",
    });
    expect(result.current.requestError?.description).not.toContain("batch");
    expect(notifyError).toHaveBeenCalledWith(
      "Something went wrong while generating the snapshot. Please try again.",
    );
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it("uses user-facing copy for common snapshot request failures", async () => {
    const cases = [
      {
        error: new Error("Sui GraphQL request failed with HTTP 503."),
        description: "Something went wrong while generating the snapshot. Please try again.",
      },
      {
        error: new Error("Missing data.objects in GraphQL response."),
        description: "Something went wrong while generating the snapshot. Please try again.",
      },
      {
        error: new Error("internal error; reference = 35mj9ufrun4toju14itug1kg"),
        description: "Something went wrong while generating the snapshot. Please try again.",
      },
      {
        error: new TypeError("fetch failed"),
        description: "The app could not connect. Check your internet connection and try again.",
      },
      {
        error: new Error("Snapshot request timed out after 45 seconds."),
        description: "The snapshot is taking longer than expected. Please try again.",
      },
    ];

    for (const { error, description } of cases) {
      const notifySuccess = vi.fn();
      const notifyError = vi.fn();
      const runSnapshotBatch = vi.fn().mockRejectedValue(error);

      const { result, unmount } = renderHook(() =>
        useSnapshotRunner({
          notifyError,
          notifySuccess,
          runSnapshotBatch,
        }),
      );

      act(() => {
        result.current.changeCoinAddress("0x2::sui::SUI");
      });

      await act(async () => {
        await result.current.submitSnapshot();
      });

      expect(result.current.requestError).toEqual({
        title: "Snapshot could not be generated",
        description,
      });
      expect(result.current.requestError?.description).not.toMatch(
        /GraphQL|HTTP|Missing data|internal error|reference|batch/i,
      );
      expect(notifyError).toHaveBeenCalledWith(description);
      expect(notifySuccess).not.toHaveBeenCalled();

      unmount();
    }
  });

  it("pauses a multi-batch snapshot when cancellation is requested between batches", async () => {
    const notifySuccess = vi.fn();
    const notifyError = vi.fn();
    const runSnapshotBatch = vi.fn().mockResolvedValueOnce(
      snapshotBatch({
        nextCursor: "cursor-1",
      }),
    );

    const { result } = renderHook(() =>
      useSnapshotRunner({
        batchPauseMs: 1_000,
        notifyError,
        notifySuccess,
        runSnapshotBatch,
      }),
    );

    act(() => {
      result.current.changeCoinAddress("0x2::sui::SUI");
    });

    act(() => {
      void result.current.submitSnapshot();
    });

    await waitFor(() => {
      expect(result.current.snapshotProgress?.objectsFetched).toBe(1);
    });

    act(() => {
      result.current.cancelSnapshot();
    });

    await waitFor(() => {
      expect(result.current.pausedRun?.objectsFetched).toBe(1);
    });

    expect(runSnapshotBatch).toHaveBeenCalledTimes(1);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.isCancelling).toBe(false);
    expect(result.current.snapshot).toBeNull();
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });
});
