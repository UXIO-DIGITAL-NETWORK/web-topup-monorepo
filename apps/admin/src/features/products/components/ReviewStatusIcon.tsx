import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ReviewFieldStatus } from "../lib/reviewProducts";

const ICONS = {
  filled: Check,
  missing: AlertTriangle,
  optional: Minus,
} as const;

const TONES = {
  filled: "text-success",
  missing: "text-warning",
  optional: "text-muted-foreground/40",
} as const;

/**
 * A review field's readiness at a glance: a green check when filled, a warning
 * triangle for a required field left empty, and a muted dash when an optional
 * field was (legitimately) left blank.
 */
export function ReviewStatusIcon({ status }: { status: ReviewFieldStatus }) {
  const { t } = useTranslation("products");
  const Icon = ICONS[status];
  const label =
    status === "filled" ? t("reviewFieldFilled") : status === "missing" ? t("reviewFieldRequired") : t("reviewFieldOptional");

  return (
    <Icon
      role="img"
      aria-label={label}
      className={cn("size-3.5 shrink-0", TONES[status])}
    />
  );
}
