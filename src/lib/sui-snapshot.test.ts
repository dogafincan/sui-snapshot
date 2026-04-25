import { describe, expect, it } from "vite-plus/test";

import {
  addDecimalAmounts,
  buildSnapshotCsv,
  buildSnapshotResult,
  compareDecimalAmounts,
  formatUnits,
  normalizeDecimalAmount,
  normalizeCoinType,
  snapshotInputSchema,
  type SnapshotResult,
} from "@/lib/sui-snapshot";

const ADDRESS_A = `0x${"1".padStart(64, "0")}`;

describe("sui snapshot helpers", () => {
  it("normalizes coin types", () => {
    expect(normalizeCoinType("0x2::sui::SUI")).toBe(`0x${"2".padStart(64, "0")}::sui::SUI`);
  });

  it("formats decimal unit strings", () => {
    expect(formatUnits(12_345n, 2)).toBe("123.45");
    expect(formatUnits(5n, 0)).toBe("5");
  });

  it("normalizes and compares decimal amount strings", () => {
    expect(normalizeDecimalAmount("1.2300")).toBe("1.23");
    expect(normalizeDecimalAmount("1.2e-7")).toBe("0.00000012");
    expect(addDecimalAmounts("1.25", "0.005")).toBe("1.255");
    expect(compareDecimalAmounts("10", "2.5")).toBe(1);
    expect(compareDecimalAmounts("0.5", "0.50")).toBe(0);
  });

  it("validates the holder snapshot input", () => {
    expect(
      snapshotInputSchema.parse({
        coinAddress: "0x2::sui::SUI",
      }),
    ).toEqual({
      coinAddress: `0x${"2".padStart(64, "0")}::sui::SUI`,
    });
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

  it("assembles a ranked snapshot from batched decimal balance rows", () => {
    expect(
      buildSnapshotResult({
        endpoint: "https://graphql.mainnet.sui.io/graphql",
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        balances: [
          { address: ADDRESS_A, balance: "1.5" },
          { address: ADDRESS_A, balance: "0.25" },
          { address: `0x${"2".padStart(64, "0")}`, balance: "2" },
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
          rawBalance: "2",
        },
        {
          rank: 2,
          address: ADDRESS_A,
          balance: "1.75",
          rawBalance: "1.75",
        },
      ],
    });
  });
});
