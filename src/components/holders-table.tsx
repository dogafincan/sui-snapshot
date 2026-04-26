import { useDeferredValue, useEffect, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SnapshotRow } from "@/lib/sui-snapshot";

export const HOLDERS_TABLE_PAGE_SIZE = 25;

export function createColumns(): ColumnDef<SnapshotRow>[] {
  return [
    {
      accessorKey: "rank",
      header: "Rank",
      cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.rank}</span>,
      enableSorting: false,
      size: 64,
    },
    {
      accessorKey: "address",
      header: "Address",
      cell: ({ row }) => <code className="font-mono">{row.original.address}</code>,
      enableSorting: false,
      filterFn: (row, columnId, value) => {
        const haystack = String(row.getValue(columnId)).toLowerCase();
        return haystack.includes(String(value).toLowerCase());
      },
    },
    {
      accessorKey: "rawBalance",
      header: "Balance",
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums">{row.original.balance}</div>
      ),
      enableSorting: false,
    },
  ];
}

export function HoldersTable({ rows }: { rows: SnapshotRow[] }) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: HOLDERS_TABLE_PAGE_SIZE,
  });
  const [addressFilterInput, setAddressFilterInput] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const deferredAddressFilter = useDeferredValue(addressFilterInput);

  useEffect(() => {
    setColumnFilters(
      deferredAddressFilter
        ? [{ id: "address", value: deferredAddressFilter.trim().toLowerCase() }]
        : [],
    );
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [deferredAddressFilter]);

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [rows]);

  const table = useReactTable({
    data: rows,
    columns: createColumns(),
    state: {
      pagination,
      columnFilters,
    },
    enableSorting: false,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.address,
  });

  const filteredRows = table.getFilteredRowModel().rows.length;
  const pageCount = Math.max(table.getPageCount(), 1);
  const holderLabel = filteredRows === 1 ? "holder" : "holders";
  const pageLabel = pageCount === 1 ? "page" : "pages";

  return (
    <div className="flex h-full min-h-[28rem] flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-1">
          <p className="font-medium">Holder distribution</p>
          <p className="text-sm text-muted-foreground">
            {filteredRows} {holderLabel} across {pageCount} {pageLabel}.
          </p>
        </div>

        <Field className="w-full min-w-0">
          <FieldLabel htmlFor="holders-filter">Filter by address</FieldLabel>
          <FieldDescription>Search the current snapshot.</FieldDescription>
          <Input
            id="holders-filter"
            value={addressFilterInput}
            onChange={(event) => setAddressFilterInput(event.target.value)}
            placeholder="0x..."
            aria-label="Filter holder table by address"
          />
        </Field>
      </div>

      <div className="min-h-0 flex-1">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={header.column.id === "rawBalance" ? "text-right" : undefined}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No holders match the current address filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-auto flex flex-row items-center justify-between gap-3">
        <p className="shrink-0 text-sm text-muted-foreground">
          Page{" "}
          <span className="font-medium text-foreground">
            {table.getState().pagination.pageIndex + 1}
          </span>{" "}
          of{" "}
          <span className="font-medium text-foreground">{Math.max(table.getPageCount(), 1)}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft data-icon="inline-start" />
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </div>
  );
}
