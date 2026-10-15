import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Box } from "@/components/common/Box";
import { DataTable } from "@/components/common/DataTable";
import { Heading } from "@/components/common/Heading";
import { Text } from "@/components/common/Text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invoiceLogColumnsFor } from "../components/invoiceLogColumns";
import { useInvoiceLogs } from "../hooks/useInvoiceLogs";
import type { InvoiceDeliveryChannel, InvoiceDeliveryStatus } from "../types/invoiceLog.type";

const DEFAULT_PAGE_SIZE = 15;
/** The "no filter" sentinel — the API treats an absent param as unfiltered. */
const ALL = "all";

/**
 * Invoice Log — the delivery trail for order receipts
 * (`GET /v1/invoice-logs`). Read-only: every row is written by the sending jobs
 * on the backend, so the page only browses (search + two filters + paginate).
 *
 * It exists because the order's own `receipt_sent_at` / `whatsapp_sent_at`
 * columns are stamped when a send is *queued* — they cannot say whether it
 * arrived.
 */
export default function InvoiceLogPage() {
  const { t } = useTranslation("transactions");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<InvoiceDeliveryChannel | typeof ALL>(ALL);
  const [status, setStatus] = useState<InvoiceDeliveryStatus | typeof ALL>(ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const params = useMemo(
    () => ({
      search: search || undefined,
      channel: channel === ALL ? undefined : channel,
      status: status === ALL ? undefined : status,
      page,
      per_page: pageSize,
    }),
    [search, channel, status, page, pageSize],
  );
  const { data, isLoading, isError, refetch } = useInvoiceLogs(params);

  return (
    <Box className="flex flex-col gap-6">
      <Box className="rounded-2xl border border-border bg-card p-6">
        <Heading
          level={1}
          variant="section"
        >{t("invoiceLogTitle")}</Heading>
        <Text variant="muted">{t("invoiceLogSubtitle")}</Text>
      </Box>

      <Box className="rounded-2xl border border-border bg-card p-4">
        <Box className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end">
          <Box className="flex flex-col gap-1.5">
            <Label htmlFor="invoice-log-search">{t("search")}</Label>
            <Box className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="invoice-log-search"
                className="w-64 rounded-xl pl-8"
                placeholder={t("invoiceLogSearchPlaceholder")}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </Box>
          </Box>

          <Box className="flex flex-col gap-1.5">
            <Label>{t("colChannel")}</Label>
            <Select
              value={channel}
              onValueChange={(value) => {
                setChannel(value as InvoiceDeliveryChannel | typeof ALL);
                setPage(1);
              }}
            >
              <SelectTrigger
                aria-label={t("colChannel")}
                className="w-44 rounded-xl"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allChannels")}</SelectItem>
                <SelectItem value="email">{t("channelEmail")}</SelectItem>
                <SelectItem value="whatsapp">{t("channelWhatsapp")}</SelectItem>
              </SelectContent>
            </Select>
          </Box>

          <Box className="flex flex-col gap-1.5">
            <Label>{t("colStatus")}</Label>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as InvoiceDeliveryStatus | typeof ALL);
                setPage(1);
              }}
            >
              <SelectTrigger
                aria-label={t("colStatus")}
                className="w-44 rounded-xl"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allLogStatuses")}</SelectItem>
                <SelectItem value="sent">{t("logStatusSent")}</SelectItem>
                <SelectItem value="failed">{t("logStatusFailed")}</SelectItem>
                <SelectItem value="skipped">{t("logStatusSkipped")}</SelectItem>
              </SelectContent>
            </Select>
          </Box>
        </Box>

        <DataTable
          columns={invoiceLogColumnsFor(t)}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          entityLabel={t("invoiceLogEntity")}
          showRowNumber
          page={data?.meta.current_page ?? page}
          pageSize={data?.meta.per_page ?? pageSize}
          total={data?.meta.total ?? 0}
          lastPage={data?.meta.last_page ?? 1}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Box>
    </Box>
  );
}
