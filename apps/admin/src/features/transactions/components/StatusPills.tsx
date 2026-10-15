import { useTranslation } from "react-i18next";
import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useStatusCounts } from "../hooks/useTransactions";
import type { TransactionStatus } from "../types/transaction.type";

const PILLS: {
  status: TransactionStatus;
  labelKey: string;
  tooltipKey: string;
  countKey: "pending" | "processing" | "completed" | "failed";
  borderClass: string;
  bgClass: string;
  hoverBgClass: string;
  activeClass: string;
}[] = [
  {
    status: "pending",
    labelKey: "pillPending",
    tooltipKey: "tipPending",
    countKey: "pending",
    borderClass: "border-warning",
    bgClass: "bg-warning/10",
    hoverBgClass: "hover:bg-warning/15",
    activeClass: "bg-warning/20 ring-2 ring-warning/30",
  },
  {
    status: "processing",
    labelKey: "pillProcessing",
    tooltipKey: "tipProcessing",
    countKey: "processing",
    borderClass: "border-chart-1",
    bgClass: "bg-chart-1/10",
    hoverBgClass: "hover:bg-chart-1/15",
    activeClass: "bg-chart-1/20 ring-2 ring-chart-1/30",
  },
  {
    status: "success",
    labelKey: "pillSuccess",
    tooltipKey: "tipSuccess",
    countKey: "completed",
    borderClass: "border-success",
    bgClass: "bg-success/10",
    hoverBgClass: "hover:bg-success/15",
    activeClass: "bg-success/20 ring-2 ring-success/30",
  },
  {
    status: "failed",
    labelKey: "pillFailed",
    tooltipKey: "tipFailed",
    countKey: "failed",
    borderClass: "border-destructive",
    bgClass: "bg-destructive/10",
    hoverBgClass: "hover:bg-destructive/15",
    activeClass: "bg-destructive/20 ring-2 ring-destructive/30",
  },
];

interface StatusPillsProps {
  active: TransactionStatus | null;
  onToggle: (status: TransactionStatus) => void;
}

/**
 * Clickable status-count filter chips above the transactions table
 * (product_requirements.md §4.3), restyled as a full-width 1x4 stat-card
 * grid — each cell color-coded per status via the design system's
 * success/destructive/chart-1 tokens plus the new `--warning` amber token
 * (design_system.md §3, 2026-07-10 revision).
 */
export function StatusPills({ active, onToggle }: StatusPillsProps) {
  const { t } = useTranslation("transactions");
  const { data: counts } = useStatusCounts();

  return (
    <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
      {PILLS.map((pill) => {
        const isActive = active === pill.status;
        return (
          <Tooltip key={pill.status}>
            <TooltipTrigger asChild>
              <Box
                as="button"
                type="button"
                onClick={() => onToggle(pill.status)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-2xl border-2 p-4 text-left transition-colors duration-200",
                  pill.borderClass,
                  isActive ? pill.activeClass : cn(pill.bgClass, pill.hoverBgClass),
                )}
              >
                <Text
                  as="span"
                  variant="small"
                  className="font-medium text-foreground"
                >
                  {t(pill.labelKey)}
                </Text>
                <Text
                  as="span"
                  className="text-2xl font-semibold tabular-nums text-foreground"
                >
                  {counts ? counts[pill.countKey] : "–"}
                </Text>
              </Box>
            </TooltipTrigger>
            <TooltipContent>{t(pill.tooltipKey)}</TooltipContent>
          </Tooltip>
        );
      })}
    </Box>
  );
}
