import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { Box } from "@/components/common/Box";
import { DataTable } from "@/components/common/DataTable";
import { Heading } from "@/components/common/Heading";
import { Text } from "@/components/common/Text";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/currency";
import { usePaymentChannelList } from "../hooks/useAdministration";
import type { PaymentChannel } from "../types/administration.type";

const DEFAULT_PAGE_SIZE = 10;

export function PaymentChannelListPage() {
  const { t } = useTranslation("administration");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const params = useMemo(() => ({ search: search || undefined, page, per_page: pageSize }), [search, page, pageSize]);
  const { data, isLoading, isError, refetch } = usePaymentChannelList(params);

  const columns = useMemo<ColumnDef<PaymentChannel>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("colChannel"),
        cell: ({ row }) => (
          <Box className="flex flex-col">
            <Text
              as="span"
              className="font-medium"
            >
              {row.original.name}
            </Text>
            <Text
              variant="muted"
              as="span"
            >
              {row.original.channel_code}
            </Text>
          </Box>
        ),
      },
      {
        accessorKey: "payment_type",
        header: t("colType"),
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className="capitalize"
          >
            {row.original.payment_type.replace(/_/g, " ")}
          </Badge>
        ),
      },
      {
        id: "fee",
        header: t("colFee"),
        cell: ({ row }) => (
          <Text
            as="span"
            className="tabular-nums"
          >
            {formatCurrency(row.original.fee_flat, { fractionDigits: 0 })}
            {row.original.fee_percent > 0 ? ` + ${row.original.fee_percent}%` : ""}
          </Text>
        ),
      },
      {
        id: "min_amount",
        header: t("colMinimum"),
        cell: ({ row }) => (
          <Text
            as="span"
            className="tabular-nums"
          >
            {formatCurrency(row.original.min_amount, { fractionDigits: 0 })}
          </Text>
        ),
      },
      {
        id: "status",
        header: t("colStatus"),
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn(row.original.is_active ? "text-success" : "text-muted-foreground")}
          >
            {row.original.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [t],
  );

  return (
    <Box className="flex flex-col gap-6">
      <Box className="rounded-2xl border border-border bg-card p-6">
        <Heading
          level={1}
          variant="section"
        >
          {t("paymentTitle")}
        </Heading>
        <Text variant="muted">{t("paymentSubtitle")}</Text>
      </Box>

      <Box className="rounded-2xl border border-border bg-card p-4">
        <Box className="flex flex-col gap-1.5">
          <Label htmlFor="channel-search">{t("search")}</Label>
          <Input
            id="channel-search"
            className="w-64 rounded-xl"
            placeholder={t("searchChannels")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </Box>
      </Box>

      <Box className="rounded-2xl border border-border bg-card p-4">
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          entityLabel={t("channelEntity")}
          emptyMessage={t("noChannels")}
          showRowNumber
          enableSelection={false}
          page={page}
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
    </Box>
  );
}

export default PaymentChannelListPage;
