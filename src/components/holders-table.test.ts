import { describe, expect, it } from "vite-plus/test";

import {
  HOLDERS_TABLE_COLUMNS,
  HOLDERS_TABLE_PAGE_SIZE,
  getHoldersPageCount,
  getHoldersPageRows,
} from "@/components/holders-table";
import type { SnapshotRow } from "@/lib/sui-snapshot";

function makeAddress(index: number) {
  return `0x${index.toString(16).padStart(64, "0")}`;
}

function makeRows(count: number): SnapshotRow[] {
  return Array.from({ length: count }, (_, index) => {
    const descending = count - index;
    return {
      rank: index + 1,
      address: makeAddress(descending),
      balance: `${descending}.00`,
      rawBalance: `${descending}`,
    };
  });
}

describe("holders table model", () => {
  it("preserves the returned holder order", () => {
    const rows = makeRows(3).reverse();
    const pageRows = getHoldersPageRows(rows, 0);

    expect(pageRows.map((row) => row.address)).toEqual(rows.map((row) => row.address));
  });

  it("uses static column labels", () => {
    expect(HOLDERS_TABLE_COLUMNS.map((column) => column.label)).toEqual([
      "Rank",
      "Address",
      "Balance",
    ]);
  });

  it("paginates the full data set using the exported page size", () => {
    const rows = makeRows(HOLDERS_TABLE_PAGE_SIZE + 5);
    const pageRows = getHoldersPageRows(rows, 1);

    expect(pageRows).toHaveLength(5);
    expect(getHoldersPageCount(rows.length)).toBe(2);
    expect(pageRows[0]?.address).toBe(rows[HOLDERS_TABLE_PAGE_SIZE]!.address);
  });
});
