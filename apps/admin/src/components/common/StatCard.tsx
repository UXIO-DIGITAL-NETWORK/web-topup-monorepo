import type { ComponentType } from "react";
import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { formatCurrency } from "@/utils/currency";
import { TrendPill, type TrendDirection } from "./TrendPill";

export interface StatCardData {
  id: string;
  label: string;
  value: number;
  /** Trend-pill variant (Dashboard/Financial): both set together, omit for the icon+caption variant. */
  deltaPct?: number;
  direction?: TrendDirection;
  /** Icon+plain-caption variant (Integration): a leading icon instead of a trend pill. */
  icon?: ComponentType<{ className?: string }>;
  iconClassName?: string;
  /** "currency" (default, formatCurrency) or "count" (plain integer, e.g. channel totals). */
  format?: "currency" | "count";
  caption: string;
}

interface StatCardProps {
  data: StatCardData;
  /**
   * Decimal digits for the currency format. Whole rupiah by default; the
   * Financial and Dashboard cards pass 2 to keep the cents their reference
   * figures carry.
   */
  fractionDigits?: number;
}

export function StatCard({ data, fractionDigits = 0 }: StatCardProps) {
  const { label, value, deltaPct, direction, caption, icon: Icon, iconClassName, format = "currency" } = data;

  const formattedValue =
    format === "count" ? value.toLocaleString("id-ID") : formatCurrency(value, { fractionDigits });

  return (
    <Box className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <Box className="flex items-center justify-between gap-2">
        <Box className="flex items-center gap-2">
          {Icon ? <Icon className={iconClassName ?? "size-4 text-muted-foreground"} /> : null}
          <Text
            as="span"
            variant="small"
            className="font-medium text-muted-foreground"
          >
            {label}
          </Text>
        </Box>
        {direction && deltaPct !== undefined ? (
          <TrendPill
            direction={direction}
            deltaPct={deltaPct}
          />
        ) : null}
      </Box>
      <Text
        as="div"
        className="text-3xl font-semibold tabular-nums text-foreground"
      >
        {formattedValue}
      </Text>
      <Text variant="small">{caption}</Text>
    </Box>
  );
}
