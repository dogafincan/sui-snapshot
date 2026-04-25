import { describe, expect, it } from "vite-plus/test";

import {
  buildSnapshotDownload,
  buildSnapshotInputFromForm,
} from "@/components/snapshot-workbench.helpers";
import type { SnapshotResult } from "@/lib/sui-snapshot";

const ADDRESS_A = `0x${"a".repeat(64)}`;

describe("snapshot workbench helpers", () => {
  it("validates and normalizes form input", () => {
    expect(
      buildSnapshotInputFromForm({
        coinAddress: "0x2::sui::SUI",
      }),
    ).toEqual({
      coinAddress: `0x${"2".padStart(64, "0")}::sui::SUI`,
    });
  });

  it("creates a stable csv download payload", () => {
    const snapshot: SnapshotResult = {
      meta: {
        endpoint: "https://graphql.mainnet.sui.io/graphql",
        coinAddress: `0x${"2".padStart(64, "0")}::sui::SUI`,
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

    expect(buildSnapshotDownload(snapshot)).toEqual({
      filename: "000000000002-sui-SUI-snapshot.csv",
      csv: `rank,address,balance\n1,${ADDRESS_A},5\n`,
    });
  });
});
