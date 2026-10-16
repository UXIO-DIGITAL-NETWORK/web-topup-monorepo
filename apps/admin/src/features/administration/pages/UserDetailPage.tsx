import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { ColumnDef, SortingState } from "@tanstack/react-table";

import { Box } from "@/components/common/Box";
import { DataTable } from "@/components/common/DataTable";
import { Heading } from "@/components/common/Heading";
import { Link } from "@/components/common/Link";
import { StatCard, type StatCardData } from "@/components/common/StatCard";
import { Text } from "@/components/common/Text";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { automaticColumnsFor } from "@/features/transactions/components/automaticColumns";
import { TransactionsTable } from "@/features/transactions/components/TransactionsTable";
import { useTransactionList } from "@/features/transactions/hooks/useTransactions";
import { formatCurrency } from "@/utils/currency";
import { formatDate, formatDateTime } from "@/utils/date";
import {
  useUserBalanceMutations,
  useUserOverview,
  useUserPointHistory,
  useUserRefunds,
} from "../hooks/useAdministration";
import type { BalanceMutationRow, PointLedgerRow, UserRefundRow } from "../types/administration.type";

const PAGE_SIZE = 10;

const money = (value: number) => formatCurrency(value, { fractionDigits: 0 });

/**
 * One account, in full: profile and aggregates at the top, then the threads that
 * hang off it — orders, wallet, points, refunds.
 *
 * The transactions table is the SAME one the transactions feature renders, fed
 * by its own hook with `userId`; the other three are scoped endpoints that only
 * exist for this page. Nothing here writes: adjustments and moderation stay on
 * the list's row actions, where the permission gates already live.
 */
export default function UserDetailPage() {
  const { t } = useTranslation("administration");
  // The transactions table's own namespace — its columns resolve their headers
  // through this `t`, so the table reads the same here as on its own page.
  const { t: tTx } = useTranslation("transactions");
  const { userId } = useParams({ strict: false });
  const id = typeof userId === "string" ? userId : undefined;

  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);

  const { data: overview, isPending, isError } = useUserOverview(id);
  const transactions = useTransactionList({
    userId: id,
    page,
    per_page: PAGE_SIZE,
    sortBy: sorting[0]?.id,
    sortDir: sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined,
  });
  const mutations = useUserBalanceMutations(id, { page: 1, per_page: PAGE_SIZE });
  const points = useUserPointHistory(id, { page: 1, per_page: PAGE_SIZE });
  const refunds = useUserRefunds(id, { page: 1, per_page: PAGE_SIZE });

  if (isPending) {
    return (
      <Box className="flex flex-col gap-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </Box>
    );
  }

  if (isError || !overview) {
    return (
      <Box className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
        <Text variant="muted">{t("userNotFound")}</Text>
        <Link
          href="/admin/users"
          className="font-medium underline"
        >
          {t("backToUsers")}
        </Link>
      </Box>
    );
  }

  const { user, stats, membership } = overview;

  const cards: StatCardData[] = [
    { id: "balance", label: t("colBalance"), value: user.balance, caption: t("statBalanceCaption") },
    { id: "point", label: t("colPoints"), value: user.point, caption: t("statPointsCaption"), format: "count" },
    { id: "spent", label: t("statSpent"), value: stats.total_spent, caption: t("statSpentCaption") },
    {
      id: "orders",
      label: t("statOrders"),
      value: stats.transactions_count,
      caption: t("statOrdersCaption"),
      format: "count",
    },
  ];

  const mutationColumns: ColumnDef<BalanceMutationRow>[] = [
    { accessorKey: "created_at", header: t("colDate"), cell: ({ row }) => formatDateTime(row.original.created_at) },
    {
      accessorKey: "type",
      header: t("colType"),
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className="capitalize"
        >
          {row.original.type}
        </Badge>
      ),
    },
    {
      id: "amount",
      header: t("colAmount"),
      cell: ({ row }) => (
        <Text
          as="span"
          className="tabular-nums"
        >
          {money(row.original.amount)}
        </Text>
      ),
    },
    {
      id: "balance_after",
      header: t("colBalanceAfter"),
      cell: ({ row }) => (
        <Text
          as="span"
          className="tabular-nums"
        >
          {money(row.original.balance_after)}
        </Text>
      ),
    },
    { accessorKey: "description", header: t("colNote"), cell: ({ row }) => row.original.description ?? "—" },
  ];

  const pointColumns: ColumnDef<PointLedgerRow>[] = [
    { accessorKey: "created_at", header: t("colDate"), cell: ({ row }) => formatDateTime(row.original.created_at) },
    {
      accessorKey: "type",
      header: t("colType"),
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className="capitalize"
        >
          {row.original.type}
        </Badge>
      ),
    },
    {
      id: "amount",
      header: t("colPointsChange"),
      cell: ({ row }) => (
        <Text
          as="span"
          className="tabular-nums"
        >
          {row.original.amount}
        </Text>
      ),
    },
    {
      id: "points_after",
      header: t("colPointsAfter"),
      cell: ({ row }) => (
        <Text
          as="span"
          className="tabular-nums"
        >
          {row.original.points_after}
        </Text>
      ),
    },
    { accessorKey: "description", header: t("colNote"), cell: ({ row }) => row.original.description ?? "—" },
  ];

  const refundColumns: ColumnDef<UserRefundRow>[] = [
    {
      accessorKey: "refund_number",
      header: t("refundNumber"),
      cell: ({ row }) => (
        <Text
          as="span"
          className="font-medium"
        >
          {row.original.refund_number}
        </Text>
      ),
    },
    {
      accessorKey: "invoice_number",
      header: t("refundInvoice"),
      cell: ({ row }) => row.original.invoice_number ?? "—",
    },
    {
      id: "amount",
      header: t("colAmount"),
      cell: ({ row }) => (
        <Text
          as="span"
          className="tabular-nums"
        >
          {money(row.original.amount)}
        </Text>
      ),
    },
    {
      accessorKey: "status",
      header: t("refundStatus"),
      cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
    },
    { accessorKey: "created_at", header: t("colDate"), cell: ({ row }) => formatDateTime(row.original.created_at) },
  ];

  return (
    <Box className="flex flex-col gap-6">
      <Box className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <Link
          href="/admin/users"
          className="w-fit text-sm text-muted-foreground underline"
        >
          {t("backToUsers")}
        </Link>
        <Box className="flex flex-wrap items-start justify-between gap-3">
          <Box className="flex flex-col gap-1">
            <Heading
              level={1}
              variant="section"
            >
              {user.name}
            </Heading>
            <Text variant="muted">
              {user.email} · {user.phone}
            </Text>
          </Box>
          <Box className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="capitalize"
            >
              {user.role ?? "—"}
            </Badge>
            <Badge
              variant={user.status === "active" ? "outline" : "destructive"}
              className="capitalize"
            >
              {user.status}
            </Badge>
          </Box>
        </Box>
        <Text variant="small">
          {t("memberSince", { date: formatDate(user.created_at) })}
          {" · "}
          {membership === null
            ? t("membershipNone")
            : `${t("membershipLabel")}: ${membership.plan ?? "—"} · ${
                membership.lifetime
                  ? t("membershipLifetime")
                  : t("membershipUntil", { date: formatDate(membership.ends_at) })
              }`}
        </Text>
      </Box>

      <Box className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <StatCard
            key={card.id}
            data={card}
          />
        ))}
      </Box>

      <Box className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-4">
        <Text
          variant="small"
          className="font-medium"
        >
          {t("tabTransactions")}
        </Text>
        <TransactionsTable
          columns={automaticColumnsFor(tTx)}
          data={transactions.data?.data ?? []}
          isLoading={transactions.isLoading}
          isError={transactions.isError}
          onRetry={() => transactions.refetch()}
          page={transactions.data?.meta.current_page ?? page}
          pageSize={transactions.data?.meta.per_page ?? PAGE_SIZE}
          total={transactions.data?.meta.total ?? 0}
          lastPage={transactions.data?.meta.last_page ?? 1}
          onPageChange={setPage}
          onPageSizeChange={() => setPage(1)}
          sorting={sorting}
          onSortingChange={setSorting}
        />
      </Box>

      <Box className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-4">
        <Text
          variant="small"
          className="font-medium"
        >
          {t("tabMutations")}
        </Text>
        <DataTable
          columns={mutationColumns}
          data={mutations.data?.data ?? []}
          isLoading={mutations.isLoading}
          isError={mutations.isError}
          onRetry={() => mutations.refetch()}
          entityLabel={t("mutationEntity")}
          emptyMessage={t("noData")}
          showRowNumber
          enableSelection={false}
          page={mutations.data?.meta.current_page ?? 1}
          pageSize={mutations.data?.meta.per_page ?? PAGE_SIZE}
          total={mutations.data?.meta.total ?? 0}
          lastPage={mutations.data?.meta.last_page ?? 1}
          onPageChange={() => undefined}
          onPageSizeChange={() => undefined}
        />
      </Box>

      <Box className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-4">
        <Text
          variant="small"
          className="font-medium"
        >
          {t("tabPoints")}
        </Text>
        <DataTable
          columns={pointColumns}
          data={points.data?.data ?? []}
          isLoading={points.isLoading}
          isError={points.isError}
          onRetry={() => points.refetch()}
          entityLabel={t("pointEntity")}
          emptyMessage={t("noData")}
          showRowNumber
          enableSelection={false}
          page={points.data?.meta.current_page ?? 1}
          pageSize={points.data?.meta.per_page ?? PAGE_SIZE}
          total={points.data?.meta.total ?? 0}
          lastPage={points.data?.meta.last_page ?? 1}
          onPageChange={() => undefined}
          onPageSizeChange={() => undefined}
        />
      </Box>

      <Box className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-4">
        <Text
          variant="small"
          className="font-medium"
        >
          {t("tabRefunds")}
        </Text>
        <DataTable
          columns={refundColumns}
          data={refunds.data?.data ?? []}
          isLoading={refunds.isLoading}
          isError={refunds.isError}
          onRetry={() => refunds.refetch()}
          entityLabel={t("refundEntity")}
          emptyMessage={t("noData")}
          showRowNumber
          enableSelection={false}
          page={refunds.data?.meta.current_page ?? 1}
          pageSize={refunds.data?.meta.per_page ?? PAGE_SIZE}
          total={refunds.data?.meta.total ?? 0}
          lastPage={refunds.data?.meta.last_page ?? 1}
          onPageChange={() => undefined}
          onPageSizeChange={() => undefined}
        />
      </Box>
    </Box>
  );
}
