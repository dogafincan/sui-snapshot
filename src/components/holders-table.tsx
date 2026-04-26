import { useDeferredValue, useEffect, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingFn,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

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
import { compareDecimalAmounts, type SnapshotRow } from "@/lib/sui-snapshot";

export const HOLDERS_TABLE_PAGE_SIZE = 25;

const decimalSorting: SortingFn<SnapshotRow> = (left, right, columnId) => {
  return compareDecimalAmounts(
    String(left.getValue(columnId) ?? "0"),
    String(right.getValue(columnId) ?? "0"),
  );
};

function SortButton({
  label,
  sorted,
  onClick,
}: {
  label: string;
  sorted: false | "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClick}>
      {label}
      {sorted === "asc" ? (
        <ArrowUp data-icon="inline-end" />
      ) : sorted === "desc" ? (
        <ArrowDown data-icon="inline-end" />
      ) : (
        <ArrowUpDown data-icon="inline-end" />
      )}
    </Button>
  );
}

export function createColumns(): ColumnDef<SnapshotRow>[] {
  return [
    {
      accessorKey: "rank",
      header: "Balance rank",
      cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.rank}</span>,
      enableSorting: false,
      size: 64,
    },
    {
      accessorKey: "address",
      header: ({ column }) => (
        <SortButton
          label="Holder"
          sorted={column.getIsSorted()}
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        />
      ),
      cell: ({ row }) => <code className="font-mono">{row.original.address}</code>,
      filterFn: (row, columnId, value) => {
        const haystack = String(row.getValue(columnId)).toLowerCase();
        return haystack.includes(String(value).toLowerCase());
      },
    },
    {
      accessorKey: "rawBalance",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortButton
            label="Balance"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums">{row.original.balance}</div>
      ),
      sortingFn: decimalSorting,
    },
  ];
}

export function HoldersTable({ rows }: { rows: SnapshotRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "rawBalance", desc: true }]);
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
      sorting,
      pagination,
      columnFilters,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.address,
  });

  const filteredRows = table.getFilteredRowModel().rows.length;

  return (
    <div className="flex h-full min-h-[28rem] flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-medium">Holder distribution</p>
          <p className="text-sm text-muted-foreground">
            {filteredRows} visible non-zero holder{filteredRows === 1 ? "" : "s"} across{" "}
            {Math.max(table.getPageCount(), 1)} page
            {table.getPageCount() === 1 ? "" : "s"}.
          </p>
        </div>

        <Field className="w-full lg:max-w-sm">
          <FieldLabel htmlFor="holders-filter">Filter by address</FieldLabel>
          <FieldDescription>
            Search the current response without rerunning the snapshot.
          </FieldDescription>
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
