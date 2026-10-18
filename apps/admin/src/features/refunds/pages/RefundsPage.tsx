import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Box } from "@/components/common/Box";
import { DataTable } from "@/components/common/DataTable";
import { Heading } from "@/components/common/Heading";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatCurrency } from "@/utils/currency";
import { refundColumnsFor } from "../components/refundColumns";
import { RefundFilterBar } from "../components/RefundFilterBar";
import { useRefundList, useRefundStatusCounts } from "../hooks/useRefunds";
import type { RefundListParams, RefundStatus } from "../types/refund.type";

const DEFAULT_PAGE_SIZE = 10;

/**
 * The pills answer the only question an operator opens this page with: how much
 * money is waiting on me, and on whom. `WAITING_ACCOUNT` is on the customer;
 * `PENDING` and `PROCESSING` are on us.
 *
 * `WAITING_DETAILS` is deliberately absent: it belongs to the retired
 * bank-transfer scheme and is draining to zero, so giving it a permanent
 * headline slot would be reserving the operator's attention for a shrinking
 * pile. It is still reachable from the status filter.
 */
// Keys, not sentences: a module constant would freeze whichever language was
// loaded at import.
const PILLS: { status: RefundStatus; labelKey: string; hintKey: string; accent: string }[] = [
  {
    status: "WAITING_ACCOUNT",
    labelKey: "awaitingAccount",
    hintKey: "hintWaitingAccount",
    accent: "border-border bg-muted/40",
  },
  {
    status: "PENDING",
    labelKey: "readyToVerify",
    hintKey: "hintPending",
    accent: "border-warning bg-warning/10",
  },
  {
    status: "PROCESSING",
    labelKey: "inProgress",
    hintKey: "hintProcessing",
    accent: "border-chart-1 bg-chart-1/10",
  },
  {
    status: "COMPLETED",
    labelKey: "completed",
    hintKey: "hintCompleted",
    accent: "border-success bg-success/10",
  },
];

export default function RefundsPage() {
  const { t } = useTranslation("refunds");
  const [filters, setFilters] = useState<RefundListParams>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const params = useMemo(() => ({ ...filters, page, per_page: pageSize }), [filters, page, pageSize]);
  const { data, isLoading, isError, refetch } = useRefundList(params);
  const { data: counts = {} } = useRefundStatusCounts();

  const handleFilterChange = (next: RefundListParams) => {
    setFilters(next);
    setPage(1);
  };

  // Search and the two selects all narrow the list; `{}` is "nothing is narrowing it".
  const filtered = Object.values(filters).some(Boolean);

  const outstanding = (data?.data ?? [])
    .filter(
      (refund) =>
        refund.status === "WAITING_ACCOUNT" ||
        refund.status === "WAITING_DETAILS" ||
        refund.status === "PENDING" ||
        refund.status === "PROCESSING",
    )
    .reduce((total, refund) => total + refund.amount, 0);

  // Late refunds are the one thing that should interrupt whatever the operator
  // came here to do, so it gets its own line rather than a fifth pill competing
  // with the states.
  const overdueCount = counts.overdue ?? 0;

  return (
    <Box className="flex flex-col gap-6">
      <Box className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-6 sm:flex-row sm:items-start sm:justify-between">
        <Box>
          <Heading
            level={1}
            variant="section"
          >{t("title")}</Heading>
          <Text variant="muted">{t("subtitle")}</Text>
        </Box>
        {outstanding > 0 && (
          <Box className="border-border shrink-0 rounded-xl border px-4 py-2 text-right">
            <Text
              variant="muted"
              as="span"
            >{t("outstanding")}</Text>
            <Text
              as="p"
              className="text-lg font-semibold tabular-nums"
            >
              {formatCurrency(outstanding, { fractionDigits: 0 })}
            </Text>
          </Box>
        )}
      </Box>

      <Box className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PILLS.map((pill) => {
          const active = filters.status === pill.status;

          return (
            <button
              key={pill.status}
              type="button"
              aria-pressed={active}
              onClick={() => handleFilterChange({ ...filters, status: active ? undefined : pill.status })}
              className={`flex flex-col gap-1 rounded-2xl border p-4 text-left transition-colors ${pill.accent} ${
                active ? "ring-ring ring-2" : ""
              }`}
            >
              <Text
                variant="muted"
                as="span"
              >
                {t(pill.labelKey)}
              </Text>
              <Text
                as="span"
                className="text-2xl font-semibold tabular-nums"
              >
                {counts[pill.status] ?? 0}
              </Text>
              <Text
                variant="muted"
                as="span"
                className="text-xs"
              >
                {t(pill.hintKey)}
              </Text>
            </button>
          );
        })}
      </Box>

      {overdueCount > 0 && (
        <Box
          as="button"
          type="button"
          onClick={() => handleFilterChange({ ...filters, overdue: true })}
          className="border-destructive bg-destructive/10 text-destructive rounded-2xl border p-4 text-left"
        >
          <Text as="span">
            {overdueCount} refund{overdueCount === 1 ? " is" : "s are"} past the 2x24 working-hour promise. Show
            {overdueCount === 1 ? " it" : " them"}.
          </Text>
        </Box>
      )}

      <RefundFilterBar
        filters={filters}
        onChange={handleFilterChange}
      />

      <DataTable
        columns={refundColumnsFor(t)}
        data={data?.data ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        entityLabel={t("entity")}
        emptyState={
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <RotateCcw />
              </EmptyMedia>
              <EmptyTitle>{t(filtered ? "emptyFilteredTitle" : "emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t(filtered ? "emptyFilteredDescription" : "emptyDescription")}</EmptyDescription>
            </EmptyHeader>
            {filtered && (
              <EmptyContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFilterChange({})}
                >
                  {t("emptyReset")}
                </Button>
              </EmptyContent>
            )}
          </Empty>
        }
        showRowNumber
        enableSelection={false}
        page={data?.meta.current_page ?? page}
        pageSize={pageSize}
        total={data?.meta.total ?? 0}
        lastPage={data?.meta.last_page ?? 1}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </Box>
  );
}
