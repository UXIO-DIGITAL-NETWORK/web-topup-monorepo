import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/currency";

interface CopyableAmountProps {
  /** `null` when the provider exposes no balance to read — see SupplierBalance. */
  value: number | null;
  className?: string;
}

/** Click-to-copy amount per product_requirements.md §4.2 — copies the exact
 * displayed string (incl. "Rp") and confirms via a sonner toast. */
export function CopyableAmount({ value, className }: CopyableAmountProps) {
  const { t } = useTranslation("common");
  // An unreadable balance is not zero, and offering "Copy Rp 0" for one would
  // be actively misleading — render an em dash and drop the button entirely.
  if (value === null) {
    return <span className={cn("font-semibold tabular-nums text-muted-foreground", className)}>—</span>;
  }

  const formatted = formatCurrency(value, { fractionDigits: 2 });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatted);
    toast.success(t("copy.copied"), { description: formatted });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleCopy}
      aria-label={`Copy ${formatted}`}
      className={cn(
        "h-auto p-0 font-semibold tabular-nums text-foreground hover:bg-transparent hover:underline",
        className,
      )}
    >
      {formatted}
    </Button>
  );
}
