import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ReceiptText } from "lucide-react";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
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

/** Small ± window of page numbers around the current page, clamped to [1, lastPage] — no ellipsis needed at this scale. */
function pageWindow(page: number, lastPage: number): number[] {
  const start = Math.max(1, page - PAGE_WINDOW);
  const end = Math.min(lastPage, page + PAGE_WINDOW);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// Rounded, always-visible horizontal scrollbar for the table container — a
// real functional scroll affordance (native overflow-x-auto).
const SCROLLBAR_CLASSNAME =
  "[&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/40 [&::-webkit-scrollbar-thumb]:hover:bg-foreground/60 [scrollbar-width:thin]";

interface TransactionsTableProps<TData extends { id: string }> {
  columns: ColumnDef<TData>[];
  data: TData[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Shown as the empty state's action when filters are narrowing the list; omit when there is nothing to clear. */
  onResetFilters?: () => void;
  page: number;
  pageSize: number;
  total: number;
  lastPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Real, service-backed sort (system_architecture.md §4.8) — lifted to the page so it can feed query params. */
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
}

/**
 * Server-mode table for Transactions (TanStack Table manual mode — data is
 * already the current page's slice from `PaginatedResponse<T>`, no client
 * pagination — system_architecture.md §4.8). Feature-local by design: the
 * dashboard's `DataTable` is client-mode and its column-alignment convention
 * doesn't fit these multi-line cells.
 *
 * Adds row selection (checkbox column, UI-only per this build's decision —
 * no bulk-action bar) and a hand-rendered row-number column reflecting
 * absolute position across pages (`(page - 1) * pageSize + rowIndex + 1`).
 */
export function TransactionsTable<TData extends { id: string }>({
  columns,
  data,
  isLoading = false,
  isError = false,
  onRetry,
  onResetFilters,
  page,
  pageSize,
  total,
  lastPage,
  onPageChange,
  onPageSizeChange,
  sorting,
  onSortingChange,
}: TransactionsTableProps<TData>) {
  const { t } = useTranslation("transactions");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Reset selection whenever the incoming page changes (new page/filter/sort
  // fetched) — selections don't carry across a refetch.
  useEffect(() => {
    setRowSelection({});
  }, [data]);

  // Memoized (stable identity across re-renders) — a fresh object here would
  // give `flexRender` a new `cell`/`header` function reference every render,
  // which React treats as a different component type and remounts, dropping
  // the checkbox's checked state right after the click that set it.
  const selectColumn = useMemo<ColumnDef<TData>>(
    () => ({
      id: "__select",
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() ? "indeterminate" : false)}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={t("selectAllRows")}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={t("selectRow")}
        />
      ),
    }),
    [t],
  );
  const fullColumns = useMemo<ColumnDef<TData>[]>(() => [selectColumn, ...columns], [selectColumn, columns]);

  const table = useReactTable({
    data,
    columns: fullColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    enableRowSelection: true,
    state: { sorting, rowSelection },
    onRowSelectionChange: setRowSelection,
  });

  // +1 for the hand-rendered row-number column (not part of the TanStack
  // column model).
  const columnCount = fullColumns.length + 1;
  const from = data.length ? (page - 1) * pageSize + 1 : 0;
  const to = data.length ? from + data.length - 1 : 0;

  function handleSortClick(columnId: string) {
    const current = sorting.find((s) => s.id === columnId);
    if (!current) onSortingChange([{ id: columnId, desc: false }]);
    else if (!current.desc) onSortingChange([{ id: columnId, desc: true }]);
    else onSortingChange([]);
  }

  if (isError) {
    return (
      <Box className="flex flex-col items-center gap-3 rounded-lg border border-border py-10">
        <Text variant="muted">{t("tableFailed")}</Text>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
          >{t("retry")}</Button>
        )}
      </Box>
    );
  }

  return (
    <Box className="flex flex-col gap-3">
      <Table containerClassName={SCROLLBAR_CLASSNAME}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              <TableHead
                key="__row-number-header"
                className="w-8"
              >
                #
              </TableHead>
              {headerGroup.headers.map((header) => {
                // Not `header.column.getCanSort()` — that also requires an
                // `accessorFn`, which the id-only columns (User/Product/
                // Cost/Status/Method/Time) don't have. Sorting here is
                // fully manual (service-backed), so `enableSorting` alone
                // (defaults true, set false on __select/action) decides it.
                const canSort = header.column.columnDef.enableSorting !== false;
                const sorted = sorting.find((s) => s.id === header.column.id);
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : canSort ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 gap-1 px-2 font-medium"
                        onClick={() => handleSortClick(header.column.id)}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {!sorted ? (
                          <ArrowUpDown className="size-3.5 text-muted-foreground/50" />
                        ) : sorted.desc ? (
                          <ArrowDown className="size-3.5" />
                        ) : (
                          <ArrowUp className="size-3.5" />
                        )}
                      </Button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
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
                className="py-8"
              >
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ReceiptText />
                    </EmptyMedia>
                    <EmptyTitle>{t(onResetFilters ? "emptyFilteredTitle" : "emptyTitle")}</EmptyTitle>
                    <EmptyDescription>{t(onResetFilters ? "emptyFilteredDescription" : "emptyDescription")}</EmptyDescription>
                  </EmptyHeader>
                  {onResetFilters && (
                    <EmptyContent>
                      <Button variant="outline" size="sm" onClick={onResetFilters}>
                        {t("emptyReset")}
                      </Button>
                    </EmptyContent>
                  )}
                </Empty>
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row, rowIndex) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
              >
                <TableCell className="w-8 tabular-nums text-muted-foreground">
                  {(page - 1) * pageSize + rowIndex + 1}
                </TableCell>
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
          <Text variant="small">{t("rowsPerPage")}</Text>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger
              className="w-20"
              aria-label={t("rowsPerPage")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem
                  key={size}
                  value={String(size)}
                >
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Box>

        <Text
          variant="small"
          className="tabular-nums"
        >
          {`${from}-${to} of ${total} transactions`}
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
