import type { TFunction } from "i18next";
import type { ColumnDef } from "@tanstack/react-table";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/utils/date";
import type { InvoiceDeliveryLog, InvoiceDeliveryStatus } from "../types/invoiceLog.type";

const STATUS_CLASS: Record<InvoiceDeliveryStatus, string> = {
  sent: "border-success/40 text-success",
  failed: "border-destructive/40 text-destructive",
  skipped: "text-muted-foreground",
};

const STATUS_KEY: Record<InvoiceDeliveryStatus, string> = {
  sent: "logStatusSent",
  failed: "logStatusFailed",
  skipped: "logStatusSkipped",
};

/**
 * Columns for the invoice-delivery trail. The `No.` column is injected by the
 * shared `DataTable` (`showRowNumber`); the feed is read-only, so there is no
 * action column.
 *
 * A factory, not a module constant: headers and status labels are rendered text,
 * so they have to resolve when the component renders.
 */
export const invoiceLogColumnsFor = (t: TFunction<"transactions">): ColumnDef<InvoiceDeliveryLog>[] => [
  {
    id: "attemptedAt",
    header: t("colAttemptedAt"),
    cell: ({ row }) => (
      <Text
        as="span"
        variant="muted"
        className="tabular-nums"
      >
        {row.original.attemptedAt ? formatDateTime(row.original.attemptedAt) : "—"}
      </Text>
    ),
  },
  {
    id: "invoice",
    header: t("colInvoiceNo"),
    cell: ({ row }) => (
      <Box className="flex flex-col">
        <Text
          as="span"
          className="font-medium tabular-nums"
        >
          {row.original.invoiceNumber ?? "—"}
        </Text>
        {row.original.isResend && (
          <Text
            as="span"
            variant="muted"
          >
            {t("logResend")}
          </Text>
        )}
      </Box>
    ),
  },
  {
    id: "channel",
    header: t("colChannel"),
    cell: ({ row }) => (
      <Badge variant="outline">
        {row.original.channel === "whatsapp" ? t("channelWhatsapp") : t("channelEmail")}
      </Badge>
    ),
  },
  {
    id: "recipient",
    header: t("colRecipient"),
    cell: ({ row }) => (
      <Text
        as="span"
        variant="muted"
      >
        {row.original.recipient ?? "—"}
      </Text>
    ),
  },
  {
    id: "status",
    header: t("colStatus"),
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={STATUS_CLASS[row.original.status]}
      >
        {t(STATUS_KEY[row.original.status])}
      </Badge>
    ),
  },
  {
    id: "reason",
    header: t("reason"),
    cell: ({ row }) => (
      <Text
        as="span"
        variant="muted"
      >
        {row.original.reason ?? "—"}
      </Text>
    ),
  },
];
