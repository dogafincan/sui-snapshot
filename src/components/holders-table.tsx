import { type ReactNode, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

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

export const HOLDERS_TABLE_COLUMNS = [
  { id: "rank", label: "Rank" },
  { id: "address", label: "Address" },
  { id: "balance", label: "Balance" },
] as const;

type HolderColumnId = (typeof HOLDERS_TABLE_COLUMNS)[number]["id"];

export function getHoldersPageCount(rowCount: number, pageSize = HOLDERS_TABLE_PAGE_SIZE) {
  return Math.max(Math.ceil(rowCount / pageSize), 1);
}

export function getHoldersPageRows(
  rows: SnapshotRow[],
  pageIndex: number,
  pageSize = HOLDERS_TABLE_PAGE_SIZE,
) {
  const start = pageIndex * pageSize;
  return rows.slice(start, start + pageSize);
}

function getColumnClassName(columnId: HolderColumnId, hasRows: boolean) {
  if (!hasRows) {
    if (columnId === "rank") {
      return "w-1/5";
    }

    if (columnId === "balance") {
      return "w-1/4 text-right";
    }

    return undefined;
  }

  if (columnId === "rank") {
    return "w-20";
  }

  if (columnId === "balance") {
    return "min-w-40 text-right";
  }

  return "min-w-[32rem]";
}

export function HoldersTable({ rows, action }: { rows: SnapshotRow[]; action?: ReactNode }) {
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [rows]);

  const holderCount = rows.length;
  const hasRows = holderCount > 0;
  const pageCount = getHoldersPageCount(holderCount);
  const pageRows = getHoldersPageRows(rows, pageIndex);
  const canPreviousPage = pageIndex > 0;
  const canNextPage = pageIndex < pageCount - 1;
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
            <TableRow>
              {HOLDERS_TABLE_COLUMNS.map((column) => (
                <TableHead key={column.id} className={getColumnClassName(column.id, hasRows)}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length > 0 ? (
              pageRows.map((row) => (
                <TableRow key={row.address}>
                  <TableCell className={getColumnClassName("rank", hasRows)}>
                    <span className="font-medium tabular-nums">{row.rank}</span>
                  </TableCell>
                  <TableCell className={getColumnClassName("address", hasRows)}>
                    <code className="font-mono" title={row.address}>
                      {row.address}
                    </code>
                  </TableCell>
                  <TableCell className={getColumnClassName("balance", hasRows)}>
                    <div className="text-right font-medium tabular-nums" title={row.balance}>
                      {row.balance}
                    </div>
                  </TableCell>
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
          Page <span className="font-medium text-foreground">{pageIndex + 1}</span> of{" "}
          <span className="font-medium text-foreground">{pageCount}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((current) => Math.max(current - 1, 0))}
            disabled={!canPreviousPage}
          >
            <ArrowLeft data-icon="inline-start" data-lucide="previous-page" />
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((current) => Math.min(current + 1, pageCount - 1))}
            disabled={!canNextPage}
          >
            Next
            <ArrowRight data-icon="inline-end" data-lucide="next-page" />
          </Button>
        </div>
      </div>
    </div>
  );
}
