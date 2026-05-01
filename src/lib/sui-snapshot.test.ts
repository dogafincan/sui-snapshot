import { describe, expect, it } from "vite-plus/test";

import {
  buildSnapshotCsv,
  buildSnapshotResult,
  COIN_TYPE_FORMAT_MESSAGE,
  COIN_TYPE_REQUIRED_MESSAGE,
  formatUnits,
  normalizeCoinType,
  snapshotInputSchema,
  type SnapshotResult,
} from "@/lib/sui-snapshot";

const ADDRESS_A = `0x${"1".padStart(64, "0")}`;

describe("sui snapshot helpers", () => {
  it("normalizes coin types", () => {
    expect(normalizeCoinType("0x2::sui::SUI")).toBe(`0x${"2".padStart(64, "0")}::sui::SUI`);
    expect(() => normalizeCoinType("not-a-coin")).toThrow(COIN_TYPE_FORMAT_MESSAGE);
  });

  it("formats decimal unit strings", () => {
    expect(formatUnits(12_345n, 2)).toBe("123.45");
    expect(formatUnits(5n, 0)).toBe("5");
  });

  it("validates the holder snapshot input", () => {
    expect(
      snapshotInputSchema.parse({
        coinAddress: "0x2::sui::SUI",
      }),
    ).toEqual({
      coinAddress: `0x${"2".padStart(64, "0")}::sui::SUI`,
    });

    const missingCoinType = snapshotInputSchema.safeParse({
      coinAddress: "",
    });

    expect(missingCoinType.success).toBe(false);
    expect(missingCoinType.error?.issues[0]?.message).toBe(COIN_TYPE_REQUIRED_MESSAGE);
  });

  it("builds the canonical holder csv output", () => {
    const snapshot: SnapshotResult = {
      meta: {
        endpoint: "https://graphql.mainnet.sui.io/graphql",
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        holderCount: 1,
        totalBalance: "5",
      },
      rows: [
        {
          rank: 1,
          address: ADDRESS_A,
          balance: "5",
          rawBalance: "500",
        },
      ],
    };

    expect(buildSnapshotCsv(snapshot)).toBe(`rank,address,balance\n1,${ADDRESS_A},5\n`);
  });

  it("assembles a ranked snapshot from batched raw balance rows", () => {
    expect(
      buildSnapshotResult({
        endpoint: "https://graphql.mainnet.sui.io/graphql",
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        decimals: 2,
        balances: [
          { address: ADDRESS_A, rawBalance: "150" },
          { address: ADDRESS_A, rawBalance: "25" },
          { address: `0x${"2".padStart(64, "0")}`, rawBalance: "200" },
          { address: `0x${"3".padStart(64, "0")}`, rawBalance: "0" },
        ],
      }),
    ).toEqual({
      meta: {
        endpoint: "https://graphql.mainnet.sui.io/graphql",
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        holderCount: 2,
        totalBalance: "3.75",
      },
      rows: [
        {
          rank: 1,
          address: `0x${"2".padStart(64, "0")}`,
          balance: "2",
          rawBalance: "200",
        },
        {
          rank: 2,
          address: ADDRESS_A,
          balance: "1.75",
          rawBalance: "175",
        },
      ],
    });
  });

  it("excludes zero-balance addresses from holder rows and totals", () => {
    const snapshot = buildSnapshotResult({
      endpoint: "https://graphql.mainnet.sui.io/graphql",
      coinAddress: normalizeCoinType("0x2::sui::SUI"),
      decimals: 2,
      balances: [
        { address: ADDRESS_A, rawBalance: "0" },
        { address: `0x${"2".padStart(64, "0")}`, rawBalance: "0000" },
        { address: `0x${"3".padStart(64, "0")}`, rawBalance: "50" },
      ],
    });

    expect(snapshot.meta.holderCount).toBe(1);
    expect(snapshot.meta.totalBalance).toBe("0.5");
    expect(snapshot.rows).toEqual([
      {
        rank: 1,
        address: `0x${"3".padStart(64, "0")}`,
        balance: "0.5",
        rawBalance: "50",
      },
    ]);
  });
});
