import { useTranslation } from "react-i18next";
import { Box } from "@/components/common/Box";
import { Heading } from "@/components/common/Heading";
import { Image } from "@/components/common/Image";
import { StatCard } from "@/components/common/StatCard";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyableAmount } from "../components/CopyableAmount";
import { usePaymentGateways, useSummaryCards, useSuppliers } from "../hooks/useFinancial";

export default function FinancialPage() {
  const { t } = useTranslation("financial");
  const {
    data: summaryCards,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useSummaryCards();
  const {
    data: gateways,
    isLoading: gatewaysLoading,
    isError: gatewaysError,
    refetch: refetchGateways,
  } = usePaymentGateways();
  const {
    data: suppliers,
    isLoading: suppliersLoading,
    isError: suppliersError,
    refetch: refetchSuppliers,
  } = useSuppliers();

  return (
    <Box className="flex flex-col gap-6">
      <Box className="rounded-2xl border border-border bg-card p-6">
        <Heading
          level={1}
          variant="section"
        >{t("title")}</Heading>
        <Text variant="muted">{t("subtitle")}</Text>
      </Box>

      <Box className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {summaryError ? (
          <Box className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 md:col-span-3">
            <Text variant="muted">{t("summaryFailed")}</Text>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchSummary()}
            >{t("retry")}</Button>
          </Box>
        ) : summaryLoading || !summaryCards ? (
          Array.from({ length: 3 }).map((_, index) => (
            <Box
              key={index}
              className="h-32 animate-pulse rounded-2xl border border-border bg-card"
            />
          ))
        ) : (
          summaryCards.map((card) => (
            <StatCard
              key={card.id}
              data={card}
              fractionDigits={2}
            />
          ))
        )}
      </Box>

      <Box className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
        <Box>
          <Heading
            level={2}
            variant="section"
            className="text-lg"
          >{t("paymentGateway")}</Heading>
          <Text variant="muted">{t("paymentGatewaySubtitle")}</Text>
        </Box>

        <Box className="flex flex-col gap-3">
          {gatewaysError ? (
            <Box className="flex flex-col items-start gap-2">
              <Text variant="muted">{t("paymentGatewayFailed")}</Text>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchGateways()}
              >{t("retry")}</Button>
            </Box>
          ) : gatewaysLoading || !gateways ? (
            Array.from({ length: 1 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-20 w-full"
              />
            ))
          ) : gateways.length === 0 ? (
            <Text variant="muted">{t("noPaymentGateways")}</Text>
          ) : (
            gateways.map((gateway) => (
              <Box
                key={gateway.id}
                className="flex flex-col gap-4 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <Box className="flex items-center gap-3">
                  <Image
                    src={gateway.logoUrl}
                    alt={gateway.name}
                    width={40}
                    height={40}
                    className="shrink-0 rounded-xl"
                  />
                  <Text
                    as="span"
                    className="font-medium text-foreground"
                  >
                    {gateway.name}
                  </Text>
                </Box>

                <Box className="flex flex-col gap-3 sm:flex-row sm:gap-3">
                  <Box className="flex items-center justify-between gap-6 rounded-xl bg-muted px-4 py-2">
                    <Text variant="small">{t("availableBalance")}</Text>
                    <CopyableAmount value={gateway.activeBalance} />
                  </Box>
                  <Box className="flex items-center justify-between gap-6 rounded-xl bg-muted px-4 py-2">
                    <Text variant="small">{t("heldBalance")}</Text>
                    <CopyableAmount value={gateway.heldBalance} />
                  </Box>
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Box>

      <Box className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
        <Box>
          <Heading
            level={2}
            variant="section"
            className="text-lg"
          >{t("supplier")}</Heading>
          <Text variant="muted">{t("supplierSubtitle")}</Text>
        </Box>

        <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliersError ? (
            <Box className="flex flex-col items-start gap-2">
              <Text variant="muted">{t("supplierFailed")}</Text>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchSuppliers()}
              >{t("retry")}</Button>
            </Box>
          ) : suppliersLoading || !suppliers ? (
            Array.from({ length: 5 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-14 w-full"
              />
            ))
          ) : suppliers.length === 0 ? (
            <Text variant="muted">{t("noSuppliers")}</Text>
          ) : (
            suppliers.map((supplier) => (
              <Box
                key={supplier.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <Box className="flex items-center gap-3">
                  <Image
                    src={supplier.logoUrl}
                    alt={supplier.name}
                    width={32}
                    height={32}
                    className="shrink-0 rounded-xl"
                  />
                  <Text
                    as="span"
                    className="font-medium text-foreground"
                  >
                    {supplier.name}
                  </Text>
                </Box>
                <CopyableAmount value={supplier.balance} />
              </Box>
            ))
          )}
        </Box>
      </Box>
    </Box>
  );
}
