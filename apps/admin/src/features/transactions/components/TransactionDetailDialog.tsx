import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import { Box } from "@/components/common/Box";
import { CopyButton } from "@/components/common/CopyButton";
import { Link } from "@/components/common/Link";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/currency";
import { formatDateTimeSeconds } from "@/utils/date";
import { useTransactionDetail } from "../hooks/useTransactions";
import { StatusBadge } from "./StatusBadge";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { ProviderStatusBadge } from "./ProviderStatusBadge";

const SKELETON_ROW_COUNT = 8;

const EM_DASH = "—";

interface TransactionDetailDialogProps {
  transactionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box className="flex items-start justify-between gap-4 py-1.5">
      <Text
        as="span"
        variant="muted"
        className="text-sm"
      >
        {label}
      </Text>
      <Box className="flex items-center gap-1 text-right">{children}</Box>
    </Box>
  );
}

function Value({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Text
      as="span"
      data-testid={testId}
      className={cn("text-sm text-foreground tabular-nums", className)}
    >
      {children}
    </Text>
  );
}

function Section({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Box className="flex flex-col gap-1">
      <Text
        as="span"
        variant="muted"
        className="text-xs font-medium uppercase tracking-wide"
      >
        {caption}
      </Text>
      <Box className="flex flex-col divide-y divide-border">{children}</Box>
    </Box>
  );
}

const money = (value: number) => formatCurrency(value, { fractionDigits: 0 });

const timestamp = (value?: string) => (value ? formatDateTimeSeconds(value) : "Not paid");

/**
 * Read-only summary of one order — what an operator opens to establish facts
 * before answering a customer or chasing a supplier.
 *
 * Three rows are shown only when they carry information: the channel fee
 * (identical to the fee on every row written since the global markup was
 * removed), the gateway amount (only a mismatch with the total is worth
 * reading), and the promo discount. `amount_base` already has the discount
 * subtracted, so the discount is labelled as applied rather than presented as
 * a subtraction that would not add up on screen.
 *
 * `resolved_at`/`elapsed_seconds` are deliberately absent: both are derived
 * from `updated_at`, so a later admin edit silently rewrites them. This screen
 * shows `updated_at` honestly as "Last Update" instead.
 */
export function TransactionDetailDialog({ transactionId, open, onOpenChange }: TransactionDetailDialogProps) {
  const { t } = useTranslation("transactions");
  // `open` gates the fetch: this dialog is mounted once per table row, so
  // without it every visible row would fetch its detail on page load.
  const { data, isPending, isError, refetch } = useTransactionDetail(transactionId, open);

  const showChannelFee = data ? data.channel_fee !== data.amount_fee : false;
  const showGatewayAmount = data?.payment.gross_amount !== undefined && data.payment.gross_amount !== data.amount_total;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("transactionDetail")}</DialogTitle>
          <DialogDescription>{t("detailSubtitle")}</DialogDescription>
        </DialogHeader>

        {isError ? (
          <Box className="flex flex-col items-start gap-3 rounded-xl border border-border p-4">
            <Text variant="muted">{t("detailFailed")}</Text>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => refetch()}
            >{t("retry")}</Button>
          </Box>
        ) : isPending || !data ? (
          <Box className="flex flex-col gap-3">
            {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-4 w-full"
              />
            ))}
          </Box>
        ) : (
          <Box className="flex flex-col gap-4">
            <Box className="flex flex-col divide-y divide-border">
              <Row label={t("invoiceNo")}>
                <Value>{data.invoice_no}</Value>
                <CopyButton
                  value={data.invoice_no}
                  label={t("invoiceNumberLower")}
                />
              </Row>
              <Row label={t("orderStatus")}>
                <StatusBadge status={data.invoice_status} />
              </Row>
              <Row label={t("paymentStatus")}>
                <PaymentStatusBadge status={data.payment_status} />
              </Row>
              <Row label={t("providerStatus")}>
                <ProviderStatusBadge status={data.provider_status} />
              </Row>
              <Row label={t("source")}>
                <Value>{data.is_manual ? "Manual" : "Automatic"}</Value>
              </Row>
            </Box>

            <Section caption={t("capCustomer")}>
              <Row label={t("name")}>
                <Value>{data.customer.name}</Value>
              </Row>
              <Row label={t("phone")}>
                <Value>{data.customer.phone || EM_DASH}</Value>
              </Row>
              <Row label={t("email")}>
                <Value>{data.customer.email ?? EM_DASH}</Value>
              </Row>
              <Row label={t("account")}>
                <Value>{data.customer.user_id ? `#${data.customer.user_id}` : "Guest checkout"}</Value>
              </Row>
            </Section>

            <Section caption={t("capOrder")}>
              <Row label={t("game")}>
                <Value>{data.game.name || EM_DASH}</Value>
              </Row>
              <Row label={t("product")}>
                <Value>{data.product.name || EM_DASH}</Value>
              </Row>
              <Row label={t("targetId")}>
                <Value>{data.target_uid ?? EM_DASH}</Value>
              </Row>
              <Row label={t("server")}>
                <Value>{data.target_server ?? EM_DASH}</Value>
              </Row>
              <Row label={t("nickname")}>
                <Value>{data.nickname ?? EM_DASH}</Value>
              </Row>
              <Row label={t("serialNumber")}>
                <Value>{data.serial_number ?? EM_DASH}</Value>
                <CopyButton
                  value={data.serial_number}
                  label={t("serialNumberLower")}
                />
              </Row>
              {data.proof_url ? (
                <Row label={t("paymentProof")}>
                  <Link
                    href={data.proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline"
                  >{t("viewProof")}</Link>
                </Row>
              ) : null}
            </Section>

            <Section caption={t("capPayment")}>
              <Row label={t("baseAmount")}>
                <Value>{money(data.amount_base)}</Value>
              </Row>
              {data.discount_amount > 0 ? (
                <Row label={t("promoDiscount")}>
                  <Value>{`${money(data.discount_amount)} (already applied)`}</Value>
                </Row>
              ) : null}
              <Row label={t("fee")}>
                <Value>{money(data.amount_fee)}</Value>
              </Row>
              {showChannelFee ? (
                <Row label={t("channelFee")}>
                  <Value>{money(data.channel_fee)}</Value>
                </Row>
              ) : null}
              <Row label={t("total")}>
                <Value className="font-medium">{money(data.amount_total)}</Value>
              </Row>
              <Row label={t("margin")}>
                <Value
                  testId="detail-margin"
                  className={cn(
                    data.margin > 0 && "text-success",
                    data.margin < 0 && "text-destructive",
                  )}
                >
                  {money(data.margin)}
                </Value>
              </Row>
              <Row label={t("method")}>
                <Value>{data.payment_method || EM_DASH}</Value>
              </Row>
              <Row label={t("gatewayReference")}>
                <Value>{data.payment.reference_id ?? EM_DASH}</Value>
                <CopyButton
                  value={data.payment.reference_id}
                  label={t("gatewayReferenceLower")}
                />
              </Row>
              <Row label={t("gatewayTrxId")}>
                <Value>{data.payment.pg_transaction_id ?? EM_DASH}</Value>
              </Row>
              {showGatewayAmount ? (
                <Row label={t("gatewayAmount")}>
                  <Value>{money(data.payment.gross_amount as number)}</Value>
                </Row>
              ) : null}
              <Row label={t("paidAt")}>
                <Value>{timestamp(data.payment.paid_at)}</Value>
              </Row>
            </Section>

            <Section caption={t("capSupplier")}>
              <Row label={t("name")}>
                <Value>{data.supplier.name ?? EM_DASH}</Value>
              </Row>
              <Row label={t("supplierTrxId")}>
                <Value>{data.supplier.trx_id ?? EM_DASH}</Value>
                <CopyButton
                  value={data.supplier.trx_id}
                  label={t("supplierTrxIdLower")}
                />
              </Row>
              {/* uxiolabs's own wording, kept as evidence. Deliberately plain
                  text next to the normalized Provider Status above, so it reads
                  as the raw source rather than a competing verdict. */}
              <Row label={t("providerStatusRaw")}>
                <Value className="text-muted-foreground">{data.supplier.status ?? EM_DASH}</Value>
              </Row>
              {/* Only for an order that arrived in PARTS. The rows above already
                  describe the first supplier order, so a normal product would
                  just see itself repeated — a mix is the case where one row
                  cannot tell the truth. */}
              {data.supplier.orders && data.supplier.orders.length > 1
                ? data.supplier.orders.map((part, index) => (
                    <Row
                      key={`${part.code ?? "part"}-${index}`}
                      label={`${t("supplierParts")} ${index + 1}`}
                    >
                      <Value className="text-muted-foreground">
                        {part.name ?? part.code ?? EM_DASH} · {part.status ?? EM_DASH}
                        {part.sn ? ` · ${part.sn}` : ""}
                      </Value>
                    </Row>
                  ))
                : null}
            </Section>

            <Section caption={t("capTiming")}>
              <Row label={t("created")}>
                <Value>{formatDateTimeSeconds(data.created_at)}</Value>
              </Row>
              <Row label={t("lastUpdate")}>
                <Value>{formatDateTimeSeconds(data.updated_at)}</Value>
              </Row>
            </Section>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
