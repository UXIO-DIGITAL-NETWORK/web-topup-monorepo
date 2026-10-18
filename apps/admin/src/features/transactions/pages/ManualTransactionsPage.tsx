import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import type { SortingState } from "@tanstack/react-table";

import { Box } from "@/components/common/Box";
import { Heading } from "@/components/common/Heading";
import { Text } from "@/components/common/Text";
import { wibDayRange } from "@/utils/date";
import { ExportButton } from "../components/ExportButton";
import { manualColumnsFor } from "../components/manualColumns";
import { TransactionFilterBar, type TransactionFilters, type FilterField } from "../components/TransactionFilterBar";
import { TransactionsTable } from "../components/TransactionsTable";
import { useTransactionList } from "../hooks/useTransactions";
import { useTransactionsRealtime } from "../hooks/useTransactionsRealtime";

const DEFAULT_PAGE_SIZE = 10;
// Manual has no provider/callback fields to filter on (no reference design
// yet — product_requirements.md §4.3) — reduced from the Automatic 10.
const MANUAL_FILTER_FIELDS: FilterField[] = [
  "search",
  "user",
  "category",
  "product",
  "invoiceStatus",
  "startDate",
  "endDate",
];

/** Provisional pending a real Manual design — reuses the Automatic table/filter pattern with fewer columns/fields. */
export default function ManualTransactionsPage() {
  const { t } = useTranslation("transactions");
  const [filters, setFilters] = useState<TransactionFilters>(() => {
    // The WIB day's bounds — see AutomaticTransactionsPage: the server buckets
    // by the day the panel shows, and an identical start/end instant is a
    // zero-width window the service can never match.
    const { start, end } = wibDayRange();
    return { startDate: start, endDate: end };
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sorting, setSorting] = useState<SortingState>([]);

  const params = useMemo(
    () => ({
      ...filters,
      page,
      per_page: pageSize,
      sortBy: sorting[0]?.id,
      sortDir: sorting[0] ? (sorting[0].desc ? ("desc" as const) : ("asc" as const)) : undefined,
    }),
    [filters, page, pageSize, sorting],
  );
  const { data, isLoading, isError, refetch } = useTransactionList(params);
  // Push new/updated transactions into the table live; the poll above is fallback.
  useTransactionsRealtime();

  const handleResetFilters = () => {
    setFilters({});
    setPage(1);
  };

  const handleFilterChange = (patch: Partial<TransactionFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  return (
    <Box className="flex flex-col gap-6">
      <Box className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-start sm:justify-between">
        <Box>
          <Heading
            level={1}
            variant="section"
          >{t("manualTitle")}</Heading>
          <Text variant="muted">{t("manualSubtitle")}</Text>
        </Box>
        <ExportButton params={params} />
      </Box>

      <Box className="flex flex-col gap-9 rounded-2xl border border-border bg-card p-4">
        <TransactionFilterBar
          filters={filters}
          onChange={handleFilterChange}
          fields={MANUAL_FILTER_FIELDS}
        />
        <TransactionsTable
          columns={manualColumnsFor(t)}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          onResetFilters={Object.values(filters).some(Boolean) ? handleResetFilters : undefined}
          page={data?.meta.current_page ?? page}
          pageSize={data?.meta.per_page ?? pageSize}
          total={data?.meta.total ?? 0}
          lastPage={data?.meta.last_page ?? 1}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          sorting={sorting}
          onSortingChange={setSorting}
        />
      </Box>
    </Box>
  );
}
