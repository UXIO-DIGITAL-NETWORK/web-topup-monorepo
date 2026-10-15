import type { TFunction } from "i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock } from "lucide-react";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/utils/currency";
import { formatDateTime } from "@/utils/date";
import { initials } from "@/utils/initials";
import { formatElapsed } from "../lib/formatElapsed";
import type { Transaction } from "../types/transaction.type";
import { RowActionMenu } from "./RowActionMenu";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { ProviderStatusBadge } from "./ProviderStatusBadge";

/** Automatic tab columns, exact shape from the reference (product_requirements.md §4.3). */
/**
 * What actually happened, for the resolved-at line in the Time column.
 *
 * Three outcomes rather than two: a payment that expired never reached the
 * supplier at all, so colouring it as a supplier failure would blame the wrong
 * half of the system.
 */
function resolvedOutcome(
  provider: Transaction["provider_status"],
  payment: Transaction["payment_status"],
): { labelKey: string; className: string } {
  if (provider === "delivered") return { labelKey: "badgeDelivered", className: "text-success" };
  if (provider === "rejected" || provider === "undelivered")
    return { labelKey: "pillFailed", className: "text-destructive" };
  if (payment === "expired") return { labelKey: "badgeExpired", className: "text-muted-foreground" };
  return { labelKey: "badgeResolved", className: "text-muted-foreground" };
}

/**
 * A factory, not a module constant: headers are rendered text, so they
 * have to resolve when the component renders.
 */
export const automaticColumnsFor = (t: TFunction<"transactions">): ColumnDef<Transaction>[] => [
  {
    accessorKey: "invoice_no",
    header: t("invoiceNo"),
    cell: ({ row }) => (
      <Box className="flex flex-col">
        <Text
          as="span"
          className="text-sm font-medium tabular-nums"
        >
          {row.original.invoice_no}
        </Text>
        {row.original.invoice_ref && (
          <Text
            variant="muted"
            as="span"
          >
            {row.original.invoice_ref}
          </Text>
        )}
      </Box>
    ),
  },
  {
    id: "user",
    header: t("colUser"),
    cell: ({ row }) => {
      const { customer } = row.original;
      return (
        <Box className="flex items-center gap-2">
          <Avatar size="sm">
            <AvatarImage
              src={customer.avatar_url}
              alt={customer.name}
            />
            <AvatarFallback>{initials(customer.name)}</AvatarFallback>
          </Avatar>
          <Box className="flex flex-col">
            <Text as="span">{customer.name}</Text>
            <Text
              variant="muted"
              as="span"
            >
              {customer.phone}
            </Text>
            {customer.email && (
              <Text
                variant="muted"
                as="span"
                className="text-xs"
              >
                {customer.email}
              </Text>
            )}
          </Box>
        </Box>
      );
    },
  },
  {
    id: "product",
    header: t("product"),
    cell: ({ row }) => (
      <Box className="flex flex-col">
        <Text as="span">{row.original.product.name}</Text>
        <Text
          variant="muted"
          as="span"
        >
          {row.original.game.name}
        </Text>
      </Box>
    ),
  },
  {
    id: "cost",
    header: t("colCost"),
    cell: ({ row }) => (
      <Box className="flex flex-col">
        <Text
          as="span"
          className="tabular-nums"
        >
          {formatCurrency(row.original.cost, { fractionDigits: 0 })}
        </Text>
        {row.original.cost_price !== undefined && (
          <Text
            variant="muted"
            as="span"
          >
            {t("modal")}:{" "}
            <Text
              as="span"
              className="tabular-nums"
            >
              {formatCurrency(row.original.cost_price, { fractionDigits: 0 })}
            </Text>
          </Text>
        )}
        {row.original.profit !== undefined && (
          <Text
            variant="muted"
            as="span"
          >
            {t("profit")}:{" "}
            <Text
              as="span"
              className="text-success tabular-nums"
            >
              {formatCurrency(row.original.profit, { fractionDigits: 0 })}
            </Text>
          </Text>
        )}
      </Box>
    ),
  },
  {
    accessorKey: "target_ref",
    header: t("colTarget"),
    cell: ({ row }) => (
      <Box className="flex flex-col">
        <Text as="span">{row.original.target_ref ?? "—"}</Text>
        {row.original.nickname && (
          <Text as="span" className="text-xs text-muted-foreground">
            {row.original.nickname}
          </Text>
        )}
      </Box>
    ),
  },
  {
    id: "payment_status",
    header: t("capPayment"),
    cell: ({ row }) => <PaymentStatusBadge status={row.original.payment_status} />,
  },
  {
    // Two columns, not two stacked badges. The stack showed both lifecycles
    // already but named neither, so a green "Success" over an amber
    // "Processing" gave an operator no way to tell which half was which.
    id: "provider_status",
    header: t("colProvider"),
    cell: ({ row }) => <ProviderStatusBadge status={row.original.provider_status} />,
  },
  {
    id: "method",
    header: t("method"),
    cell: ({ row }) => (
      <Box className="flex flex-col">
        <Text as="span">{row.original.payment_method}</Text>
        {row.original.admin_fee !== undefined && (
          <Text
            variant="muted"
            as="span"
          >
            {t("adminFee")}:{" "}
            <Text
              as="span"
              className="text-warning tabular-nums"
            >
              {formatCurrency(row.original.admin_fee, { fractionDigits: 0 })}
            </Text>
          </Text>
        )}
      </Box>
    ),
  },
  {
    id: "time",
    header: t("colTime"),
    cell: ({ row }) => {
      const tx = row.original;
      // Reads the provider lifecycle, which is what "resolved" actually means
      // here — an order is done when the supplier is done with it. The old
      // `invoice_status === "failed"` test was wrong for a refunded row: it is
      // neither "failed" nor a success, so it rendered a green "Success".
      const outcome = resolvedOutcome(tx.provider_status, tx.payment_status);
      return (
        <Box className="flex flex-col gap-1">
          <Text
            variant="muted"
            as="span"
          >
            Created: {formatDateTime(tx.created_at)}
          </Text>
          {tx.resolved_at && (
            <Text
              as="span"
              className={outcome.className}
            >
              {t(outcome.labelKey)}: {formatDateTime(tx.resolved_at)}
            </Text>
          )}
          {tx.elapsed_seconds !== undefined && (
            <Badge
              variant="outline"
              className="w-fit gap-1 tabular-nums"
            >
              <Clock className="size-3" />
              {formatElapsed(tx.elapsed_seconds)}
            </Badge>
          )}
        </Box>
      );
    },
  },
  {
    id: "action",
    header: t("colAction"),
    enableSorting: false,
    cell: ({ row }) => <RowActionMenu transaction={row.original} />,
  },
];
