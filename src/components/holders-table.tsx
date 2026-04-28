import { type ReactNode, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
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
      cell: ({ row }) => (
        <code className="font-mono" title={row.original.address}>
          {row.original.address}
        </code>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "rawBalance",
      header: "Balance",
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums" title={row.original.balance}>
          {row.original.balance}
        </div>
      ),
      enableSorting: false,
    },
  ];
}

function getColumnClassName(columnId: string, hasRows: boolean) {
  if (!hasRows) {
    if (columnId === "rank") {
      return "w-1/5";
    }

    if (columnId === "rawBalance") {
      return "w-1/4 text-right";
    }

    return undefined;
  }

  if (columnId === "rank") {
    return "w-20";
  }

  if (columnId === "rawBalance") {
    return "min-w-40 text-right";
  }

  return "min-w-[32rem]";
}

export function HoldersTable({ rows, action }: { rows: SnapshotRow[]; action?: ReactNode }) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: HOLDERS_TABLE_PAGE_SIZE,
  });

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [rows]);

  const table = useReactTable({
    data: rows,
    columns: createColumns(),
    state: {
      pagination,
    },
    enableSorting: false,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.address,
  });

  const holderCount = rows.length;
  const hasRows = holderCount > 0;
  const pageCount = Math.max(table.getPageCount(), 1);
  const holderLabel = holderCount === 1 ? "holder" : "holders";
  const pageLabel = pageCount === 1 ? "page" : "pages";

  return (
    <div className="flex h-full min-h-[28rem] flex-col gap-4">
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>Ranked holders</ItemTitle>
          <ItemDescription>
            {holderCount} {holderLabel} across {pageCount} {pageLabel}.
          </ItemDescription>
        </ItemContent>
      </Item>

      {action ? <div className="flex w-full">{action}</div> : null}

      <div className="min-h-0 min-w-0 max-w-full flex-1">
        <Table className={hasRows ? "w-max min-w-full" : "w-full"}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={getColumnClassName(header.column.id, hasRows)}
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
                    <TableCell
                      key={cell.id}
                      className={getColumnClassName(cell.column.id, hasRows)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-10 text-center text-base text-muted-foreground"
                >
                  No holders to display.
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
            <ArrowLeft data-icon="inline-start" data-lucide="previous-page" />
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
            <ArrowRight data-icon="inline-end" data-lucide="next-page" />
          </Button>
        </div>
      </div>
    </div>
  );
}
