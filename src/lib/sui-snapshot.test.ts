import { describe, expect, it } from "vite-plus/test";

import {
  allocateAirdropShares,
  buildSnapshotCsv,
  formatUnits,
  normalizeCoinType,
  normalizeExcludedAddresses,
  parseUnits,
  snapshotInputSchema,
  type SnapshotResult,
} from "@/lib/sui-snapshot";

const ADDRESS_A = `0x${"1".padStart(64, "0")}`;
const ADDRESS_B = `0x${"2".padStart(64, "0")}`;

describe("sui snapshot helpers", () => {
  it("normalizes coin types and excluded addresses", () => {
    expect(normalizeCoinType("0x2::sui::SUI")).toBe(`0x${"2".padStart(64, "0")}::sui::SUI`);

    expect(
      normalizeExcludedAddresses([
        "0x1",
        ADDRESS_A,
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      ]),
    ).toEqual([ADDRESS_A]);
  });

  it("formats and parses decimal unit strings", () => {
    expect(parseUnits("123.45", 2)).toBe(12_345n);
    expect(formatUnits(12_345n, 2)).toBe("123.45");
    expect(formatUnits(5n, 0)).toBe("5");
  });

  it("allocates proportional airdrops and assigns the remainder to the top holder", () => {
    const allocation = allocateAirdropShares(
      [
        { address: ADDRESS_A, rawBalance: 2n },
        { address: ADDRESS_B, rawBalance: 1n },
      ],
      10n,
      new Set<string>(),
    );

    expect(allocation.eligibleHolderCount).toBe(2);
    expect(allocation.allocations.get(ADDRESS_A)).toBe(7n);
    expect(allocation.allocations.get(ADDRESS_B)).toBe(3n);
  });

  it("rejects airdrops when no eligible holder remains", () => {
    expect(() =>
      allocateAirdropShares([{ address: ADDRESS_A, rawBalance: 5n }], 100n, new Set([ADDRESS_A])),
    ).toThrow("No eligible holders remain after exclusions.");
  });

  it("requires an airdrop amount when exclusions are provided", () => {
    expect(() =>
      snapshotInputSchema.parse({
        coinAddress: "0x2::sui::SUI",
        excludedAddresses: [ADDRESS_A],
      }),
    ).toThrow("Excluded addresses can only be used when an airdrop amount is provided.");
  });

  it("builds csv output that matches the current public format", () => {
    const snapshot: SnapshotResult = {
      meta: {
        endpoint: "https://graphql.mainnet.sui.io/graphql",
        coinAddress: normalizeCoinType("0x2::sui::SUI"),
        decimals: 2,
        holderCount: 1,
        exclusionCount: 0,
        eligibleHolderCount: 1,
        airdropEnabled: true,
        totalBalance: "5",
        totalAirdropAmount: "1",
      },
      rows: [
        {
          rank: 1,
          address: ADDRESS_A,
          balance: "5",
          rawBalance: "500",
          airdropAmount: "1",
          rawAirdropAmount: "100",
        },
      ],
    };

    expect(buildSnapshotCsv(snapshot)).toBe(
      `rank,address,balance,airdrop_amount\n1,${ADDRESS_A},5,1\n`,
    );
  });
});
