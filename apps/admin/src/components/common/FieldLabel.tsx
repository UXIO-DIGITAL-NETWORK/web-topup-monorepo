import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { Box } from "@/components/common/Box";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A small info icon that reveals a detailed explanation on hover/focus. Use it
 * next to a field label or a non-obvious button so operators know what a control
 * does without cluttering the layout with helper text.
 */
export function InfoTooltip({ content, className }: { content: ReactNode; className?: string }) {
  const { t } = useTranslation("common");
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={t("field.moreInformation")}
        className={cn(
          "text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-4 items-center justify-center rounded-full outline-none focus-visible:ring-2",
          className,
        )}
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left leading-snug whitespace-normal">{content}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A form label with an optional info tooltip beside it — the shape every field
 * repeats. Replaces a bare `<Label>` so any field can carry a concise, detailed
 * explanation with no extra markup at the call site.
 *
 * `required`/`optional` add the "wajib"/"opsional" markers every form field is
 * expected to carry. The marker is a **sibling** of the `<Label>`, not inside
 * it: `getByLabelText` reads a label's full `textContent` (it does not honour
 * `aria-hidden`), so a marker inside the label would turn "Reason" into
 * "Reason*" and break every label-text query in the suite. It is also
 * `aria-hidden` so the accessible name stays the field's text — accessibility is
 * carried by `aria-required` on the control, which each wrapper sets.
 */
export function FieldLabel({
  htmlFor,
  children,
  tooltip,
  className,
  labelClassName,
  required,
  optional,
}: {
  htmlFor?: string;
  children: ReactNode;
  tooltip?: ReactNode;
  className?: string;
  /** Extra classes for the `<Label>` itself — for screens that style their own label. */
  labelClassName?: string;
  required?: boolean;
  optional?: boolean;
}) {
  const { t } = useTranslation("common");

  return (
    <Box className={cn("flex items-center gap-1.5", className)}>
      <Label
        htmlFor={htmlFor}
        className={cn("gap-1", labelClassName)}
      >
        {children}
      </Label>
      {required && (
        <span
          aria-hidden="true"
          className="text-destructive"
          title={t("field.required")}
        >
          *
        </span>
      )}
      {optional && (
        <span
          aria-hidden="true"
          className="text-muted-foreground font-normal"
        >
          ({t("field.optional")})
        </span>
      )}
      {tooltip && <InfoTooltip content={tooltip} />}
    </Box>
  );
}
