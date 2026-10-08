import { useTranslation } from "react-i18next";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/currency";
import { ReviewStatusIcon } from "./ReviewStatusIcon";
import type { ReviewFieldStatus } from "../lib/reviewProducts";

const rupiah = (value: number) => formatCurrency(value, { fractionDigits: 0 });

/** One membership plan's price under the current margin. */
export interface MarginSimulationRow {
  key: string;
  label: string;
  price: number;
  /** Where the price came from — a typed margin, the pricing rule, or cost. */
  hint?: string;
}

interface MarginSimulationCardProps {
  /** The accumulated cost the simulation is measured against. */
  cost: number;
  rows: MarginSimulationRow[];
  /** Where the cost came from, for a mix: main SKU + components. */
  breakdown?: { main: number; mix: number };
  /** Readiness of the default plan's price, shown in the header when reviewing. */
  status?: ReviewFieldStatus;
}

/**
 * "Simulasi Margin vs Harga Modal" — for each plan, the selling price the
 * current margin produces, the profit over cost, and the markup percent.
 *
 * It mirrors the backend's own maths (`ceil(cost × (1 + %/100)) + flat`, then
 * fewer the accumulated cost), so the number shown is the number the server
 * will write. Unlike `PlanPriceCard`, it measures against the ACCUMULATED cost —
 * the reason a mix shows the main SKU plus every component in one figure.
 */
export function MarginSimulationCard({ cost, rows, breakdown, status }: MarginSimulationCardProps) {
  const { t } = useTranslation("products");

  return (
    <Box className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
      <Box className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-3 py-2">
        <Text
          as="span"
          variant="small"
          className="font-medium tracking-wide uppercase"
        >
          {t("marginSimulationTitle")}
        </Text>
        <Box className="flex items-center gap-2">
          {status && <ReviewStatusIcon status={status} />}
          <Text
            as="span"
            variant="small"
            className="tabular-nums text-muted-foreground"
          >
            {t("cost")}: {rupiah(cost)}
            {breakdown ? ` (${rupiah(breakdown.main)} + ${rupiah(breakdown.mix)})` : ""}
          </Text>
        </Box>
      </Box>

      {rows.length === 0 ? (
        <Box className="px-3 py-2">
          <Text variant="muted">{t("noPricedPlans")}</Text>
        </Box>
      ) : (
        rows.map((row) => {
          const profit = row.price - cost;
          const percent = cost > 0 ? (profit / cost) * 100 : 0;

          return (
            <Box
              key={row.key}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <Box className="flex min-w-0 flex-col">
                <Text as="span">{row.label}</Text>
                {row.hint && (
                  <Text
                    as="span"
                    variant="small"
                    className="text-muted-foreground"
                  >
                    {row.hint}
                  </Text>
                )}
              </Box>
              <Box className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  title={t("profit")}
                  className={cn(
                    "tabular-nums",
                    profit >= 0
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                  )}
                >
                  {profit >= 0 ? "+" : "−"}
                  {rupiah(Math.abs(profit))}
                </Badge>
                <Text
                  as="span"
                  variant="small"
                  className="tabular-nums text-muted-foreground"
                >
                  {cost > 0 ? `${percent.toFixed(1)}%` : "—"}
                </Text>
                <Text
                  as="span"
                  className="font-medium tabular-nums"
                >
                  {rupiah(row.price)}
                </Text>
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
}
