import { useDeferredValue, useEffect, useState } from "react"
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
} from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { SnapshotRow } from "@/lib/sui-snapshot"

export const HOLDERS_TABLE_PAGE_SIZE = 25

const bigintSorting: SortingFn<SnapshotRow> = (left, right, columnId) => {
  const leftValue = BigInt(String(left.getValue(columnId) ?? "0"))
  const rightValue = BigInt(String(right.getValue(columnId) ?? "0"))

  if (leftValue === rightValue) {
    return 0
  }

  return leftValue > rightValue ? 1 : -1
}

function SortButton({
  label,
  sorted,
  onClick,
}: {
  label: string
  sorted: false | "asc" | "desc"
  onClick: () => void
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
  )
}

function PaginationControls({
  pageLabel,
  onPrevious,
  onNext,
  disablePrevious,
  disableNext,
}: {
  pageLabel: string
  onPrevious: () => void
  onNext: () => void
  disablePrevious: boolean
  disableNext: boolean
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">{pageLabel}</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={disablePrevious}
        >
          <ChevronLeft data-icon="inline-start" />
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={disableNext}
        >
          Next
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  )
}

function PreviewTableSurface({
  mode,
}: {
  mode: "preview" | "loading"
}) {
  const isLoading = mode === "loading"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {isLoading ? "Loading workspace" : "Preview workspace"}
            </Badge>
            <Badge variant="outline">Optional airdrop column</Badge>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium">Holder distribution</p>
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? "Preparing the ranked holder table, filters, and pagination controls."
                : "The ranked holder table, address filter, and pagination appear here after the snapshot runs."}
            </p>
          </div>
        </div>

        <Field className="w-full lg:max-w-sm">
          <FieldLabel htmlFor="holders-filter-preview">
            Filter by address
          </FieldLabel>
          <FieldDescription>
            Client-side filtering on the current response payload.
          </FieldDescription>
          <Input
            id="holders-filter-preview"
            placeholder={isLoading ? "Loading results..." : "0x..."}
            disabled
            aria-label="Preview holder address filter"
          />
        </Field>
      </div>

      <div className="overflow-hidden rounded-[calc(var(--radius)*3)] border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Holder</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }, (_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-4 w-6" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-full max-w-56" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end">
                    <Skeleton className="h-4 w-20" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaginationControls
        pageLabel="Page 1 of 1"
        onPrevious={() => undefined}
        onNext={() => undefined}
        disablePrevious
        disableNext
      />
    </div>
  )
}

export function HoldersTablePreview({
  mode = "preview",
}: {
  mode?: "preview" | "loading"
}) {
  return <PreviewTableSurface mode={mode} />
}

export function createColumns(showAirdrop: boolean): ColumnDef<SnapshotRow>[] {
  const columns: ColumnDef<SnapshotRow>[] = [
    {
      accessorKey: "rank",
      header: "Rank",
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{row.original.rank}</span>
      ),
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
        const haystack = String(row.getValue(columnId)).toLowerCase()
        return haystack.includes(String(value).toLowerCase())
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
        <div className="text-right font-medium tabular-nums">
          {row.original.balance}
        </div>
      ),
      sortingFn: bigintSorting,
    },
  ]

  if (showAirdrop) {
    columns.push({
      accessorKey: "rawAirdropAmount",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortButton
            label="Airdrop"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium tabular-nums">
          {row.original.airdropAmount ?? "0"}
        </div>
      ),
      sortingFn: bigintSorting,
    })
  }

  return columns
}

export function HoldersTable({
  rows,
  showAirdrop,
}: {
  rows: SnapshotRow[]
  showAirdrop: boolean
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "rawBalance", desc: true },
  ])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: HOLDERS_TABLE_PAGE_SIZE,
  })
  const [addressFilterInput, setAddressFilterInput] = useState("")
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const deferredAddressFilter = useDeferredValue(addressFilterInput)

  useEffect(() => {
    setColumnFilters(
      deferredAddressFilter
        ? [{ id: "address", value: deferredAddressFilter.trim().toLowerCase() }]
        : [],
    )
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }, [deferredAddressFilter])

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }, [rows])

  const table = useReactTable({
    data: rows,
    columns: createColumns(showAirdrop),
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
  })

  const filteredRows = table.getFilteredRowModel().rows.length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {filteredRows} visible holder{filteredRows === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline">
              {rows.length} total row{rows.length === 1 ? "" : "s"}
            </Badge>
            {showAirdrop ? <Badge variant="outline">Airdrop enabled</Badge> : null}
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium">Holder distribution</p>
            <p className="text-sm text-muted-foreground">
              Sorted client-side with address filtering and pagination.
            </p>
          </div>
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

      <div className="overflow-hidden rounded-[calc(var(--radius)*3)] border bg-background">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      header.column.id === "rawBalance" ||
                      header.column.id === "rawAirdropAmount"
                        ? "text-right"
                        : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
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
                <TableCell
                  colSpan={showAirdrop ? 4 : 3}
                  className="py-10 text-center text-muted-foreground"
                >
                  No holders match the current address filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationControls
        pageLabel={`Page ${table.getState().pagination.pageIndex + 1} of ${Math.max(table.getPageCount(), 1)}`}
        onPrevious={() => table.previousPage()}
        onNext={() => table.nextPage()}
        disablePrevious={!table.getCanPreviousPage()}
        disableNext={!table.getCanNextPage()}
      />
    </div>
  )
}
