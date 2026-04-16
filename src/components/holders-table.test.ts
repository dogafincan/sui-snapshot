import { describe, expect, it } from "vite-plus/test";
import {
  createTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";

import { HOLDERS_TABLE_PAGE_SIZE, createColumns } from "@/components/holders-table";
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
      rawBalance: `${descending * 100}`,
      airdropAmount: `${descending / 10}`,
      rawAirdropAmount: `${descending * 10}`,
    };
  });
}

function buildTable(
  rows: SnapshotRow[],
  sorting: SortingState,
  columnFilters: ColumnFiltersState,
  pagination: PaginationState,
) {
  return createTable({
    data: rows,
    columns: createColumns(true),
    state: {
      sorting,
      columnFilters,
      pagination,
    },
    onStateChange: () => undefined,
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.address,
  });
}

describe("holders table model", () => {
  it("sorts by raw balances using bigint semantics", () => {
    const rows = makeRows(3);
    const table = buildTable(rows, [{ id: "rawBalance", desc: true }], [], {
      pageIndex: 0,
      pageSize: HOLDERS_TABLE_PAGE_SIZE,
    });

    expect(table.getRowModel().rows.map((row) => row.original.address)).toEqual([
      makeAddress(3),
      makeAddress(2),
      makeAddress(1),
    ]);
  });

  it("filters the holder list by address fragment", () => {
    const rows = makeRows(10);
    const target = rows[7]!.address;
    const table = buildTable(
      rows,
      [{ id: "rawBalance", desc: true }],
      [{ id: "address", value: target }],
      { pageIndex: 0, pageSize: HOLDERS_TABLE_PAGE_SIZE },
    );

    expect(table.getRowModel().rows.map((row) => row.original.address)).toEqual([target]);
  });

  it("paginates the full data set using the exported page size", () => {
    const rows = makeRows(HOLDERS_TABLE_PAGE_SIZE + 5);
    const table = buildTable(rows, [{ id: "rawBalance", desc: true }], [], {
      pageIndex: 1,
      pageSize: HOLDERS_TABLE_PAGE_SIZE,
    });

    expect(table.getRowModel().rows).toHaveLength(5);
    expect(table.getPageCount()).toBe(2);
    expect(table.getRowModel().rows[0]?.original.address).toBe(
      rows[HOLDERS_TABLE_PAGE_SIZE]!.address,
    );
  });
});
