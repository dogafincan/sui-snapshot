import { describe, expect, it } from "vite-plus/test";
import {
  createTable,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
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
      rawBalance: `${descending}`,
    };
  });
}

function buildTable(rows: SnapshotRow[], pagination: PaginationState) {
  return createTable({
    data: rows,
    columns: createColumns(),
    state: {
      pagination,
    },
    enableSorting: false,
    onStateChange: () => undefined,
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.address,
  });
}

describe("holders table model", () => {
  it("preserves the returned holder order", () => {
    const rows = makeRows(3).reverse();
    const table = buildTable(rows, {
      pageIndex: 0,
      pageSize: HOLDERS_TABLE_PAGE_SIZE,
    });

    expect(table.getRowModel().rows.map((row) => row.original.address)).toEqual(
      rows.map((row) => row.address),
    );
  });

  it("uses static non-sortable column labels", () => {
    const columns = createColumns();

    expect(columns.map((column) => column.header)).toEqual(["Rank", "Address", "Balance"]);
    expect(columns.every((column) => column.enableSorting === false)).toBe(true);
    expect(columns.some((column) => "filterFn" in column)).toBe(false);
  });

  it("paginates the full data set using the exported page size", () => {
    const rows = makeRows(HOLDERS_TABLE_PAGE_SIZE + 5);
    const table = buildTable(rows, {
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
