import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";

import { Lock } from "lucide-react";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const LOADING_ROW_COUNT = 5;
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const PAGE_WINDOW = 2;

function pageWindow(page: number, lastPage: number): number[] {
  const start = Math.max(1, page - PAGE_WINDOW);
  const end = Math.min(lastPage, page + PAGE_WINDOW);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

interface DataTableProps<TData extends { id: string }> {
  columns: ColumnDef<TData>[];
  data: TData[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
  /** Replaces `emptyMessage` with richer content (e.g. a shadcn `Empty`) when there are no rows. */
  emptyState?: ReactNode;
  /** Plural noun for the footer count and the error state. Kept a prop
   * because every reference frame ships the "of 9999999 transactions" string
   * copy-pasted from Transaction, whatever the table actually lists
   * (product_requirements.md §4.5, line 208). */
  entityLabel: string;
  /** Absolute row numbering ("No."). */
  showRowNumber?: boolean;
  /** Row checkboxes. Off for lists with no bulk action — the Category Type
   * reference shows no selection column at all (§4.5). */
  enableSelection?: boolean;
  /** Per-row selection guard. A row that returns `false` is never selectable —
   * its checkbox is replaced by a lock glyph and it never enters the selection.
   * Used to protect System provider rows from bulk actions. */
  canSelectRow?: (row: TData) => boolean;
  /** Label rendered in the page-size trigger, e.g. `10 Row`. Defaults to the
   * bare number. */
  formatPageSizeLabel?: (pageSize: number) => string;
  /** Reports the checkbox selection upward so a toolbar can offer a bulk
   * action. Selection itself stays owned here — it already resets on `data`,
   * which is exactly the post-delete refetch. */
  onSelectionChange?: (ids: string[]) => void;
  page: number;
  pageSize: number;
  total: number;
  lastPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/**
 * Shared server-mode table (TanStack Table manual mode —
 * system_architecture.md §4.8). Trimmed from `TransactionsTable`: keeps the
 * checkbox-select column and pagination footer (the reference's
 * interaction pattern), drops sortable headers and dnd-kit drag-to-reorder
 * — neither the category taxonomy nor the product list calls for them.
 * // ponytail: no client sort/reorder here; add server-backed sorting if a
 * column ever needs it.
 *
 * Promoted out of `features/categories` on 2026-07-28 when `products` became
 * the second feature to need this exact shape (feature isolation forbids
 * importing it across features). `features/dashboard/components/DataTable`
 * is a *different*, client-mode component that happens to share the name —
 * a follow-up merge candidate, deliberately untouched here.
 */
export function DataTable<TData extends { id: string }>({
  columns,
  data,
  isLoading = false,
  isError = false,
  onRetry,
  emptyMessage,
  emptyState,
  entityLabel,
  showRowNumber = false,
  enableSelection = true,
  canSelectRow,
  formatPageSizeLabel,
  onSelectionChange,
  page,
  pageSize,
  total,
  lastPage,
  onPageChange,
  onPageSizeChange,
}: DataTableProps<TData>) {
  const { t } = useTranslation("common");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Keyed on the row ids, not the array identity: callers pass
  // `data?.data ?? []`, so a fresh `[]` arrives on every render while the
  // query is loading — keying on `data` itself re-fired this effect forever
  // once a parent re-rendered in response to the selection below.
  const rowIdsKey = data.map((row) => row.id).join(",");
  useEffect(() => {
    setRowSelection({});
  }, [rowIdsKey]);

  useEffect(() => {
    onSelectionChange?.(Object.keys(rowSelection));
  }, [rowSelection, onSelectionChange]);

  const selectColumn = useMemo<ColumnDef<TData>>(
    () => ({
      id: "__select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() ? "indeterminate" : false)}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={t("table.selectAllRows")}
        />
      ),
      cell: ({ row }) =>
        row.getCanSelect() ? (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={t("table.selectRow")}
          />
        ) : (
          // Protected row (e.g. a System provider): not selectable, so the
          // checkbox slot carries a lock instead of an empty gap.
          <Lock
            className="size-4 text-muted-foreground"
            aria-label={t("table.lockedRow")}
          />
        ),
    }),
    [t],
  );
  // Absolute (not page-relative) numbering: `row.index` is the index within
  // the current page's rows, since manual pagination only ever hands us one
  // page of data.
  const rowNumberColumn = useMemo<ColumnDef<TData>>(
    () => ({
      id: "__row_number",
      header: t("table.rowNumber"),
      cell: ({ row }) => (
        <Text
          as="span"
          className="tabular-nums"
        >
          {(page - 1) * pageSize + row.index + 1}
        </Text>
      ),
    }),
    [page, pageSize],
  );

  const fullColumns = useMemo<ColumnDef<TData>[]>(
    () => [...(enableSelection ? [selectColumn] : []), ...(showRowNumber ? [rowNumberColumn] : []), ...columns],
    [selectColumn, rowNumberColumn, enableSelection, showRowNumber, columns],
  );

  const table = useReactTable({
    data,
    columns: fullColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualPagination: true,
    enableRowSelection: canSelectRow ? (row) => canSelectRow(row.original) : true,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
  });

  const columnCount = fullColumns.length;
  const from = data.length ? (page - 1) * pageSize + 1 : 0;
  const to = data.length ? from + data.length - 1 : 0;

  if (isError) {
    return (
      <Box className="flex flex-col items-center gap-3 rounded-lg border border-border py-10">
        <Text variant="muted">Something went wrong loading {entityLabel}.</Text>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
          >
            Retry
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: LOADING_ROW_COUNT }).map((_, rowIndex) => (
              <TableRow key={`skeleton-${rowIndex}`}>
                {Array.from({ length: columnCount }).map((_, colIndex) => (
                  <TableCell key={colIndex}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className={emptyState ? "py-8" : "py-8 text-center text-muted-foreground"}
              >
                {emptyState ?? emptyMessage ?? t("table.empty", { entity: entityLabel })}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Box className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <Box className="flex items-center gap-2">
          <Text variant="small">{t("table.rowsPerPage")}</Text>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger
              className={formatPageSizeLabel ? "w-28" : "w-20"}
              aria-label={t("table.rowsPerPage")}
            >
              {/* A child overrides Radix's own value rendering, which is how
                  the Product reference gets "10 Row" in the trigger while the
                  open list still reads as plain numbers. */}
              <SelectValue>{formatPageSizeLabel ? formatPageSizeLabel(pageSize) : pageSize}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem
                  key={size}
                  value={String(size)}
                >
                  {formatPageSizeLabel ? formatPageSizeLabel(size) : size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Box>

        <Text
          variant="small"
          className="tabular-nums"
        >
          {t("table.range", { from, to, total, entity: entityLabel })}
        </Text>

        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-disabled={page <= 1}
                className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  if (page > 1) onPageChange(page - 1);
                }}
              />
            </PaginationItem>
            {pageWindow(page, lastPage).map((pageNumber) => (
              <PaginationItem key={pageNumber}>
                <PaginationLink
                  href="#"
                  isActive={pageNumber === page}
                  className="tabular-nums"
                  onClick={(event) => {
                    event.preventDefault();
                    onPageChange(pageNumber);
                  }}
                >
                  {pageNumber}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                href="#"
                aria-disabled={page >= lastPage}
                className={page >= lastPage ? "pointer-events-none opacity-50" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  if (page < lastPage) onPageChange(page + 1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Box>
    </Box>
  );
}
