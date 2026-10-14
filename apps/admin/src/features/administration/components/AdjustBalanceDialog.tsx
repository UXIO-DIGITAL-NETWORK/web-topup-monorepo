import { translateOptions } from "@/lib/i18nOptions";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { SelectField } from "@/components/common/SelectField";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  balanceAdjustmentSchema,
  type BalanceAdjustmentFormValues,
} from "../schemas/balanceAdjustment.schema";
import type { BalanceAdjustmentInput } from "../types/administration.type";

interface AdjustBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  onConfirm: (input: BalanceAdjustmentInput) => void;
  isPending?: boolean;
}

// `labelKey`, not `label`: a module constant would freeze whichever language
// was loaded at import.
const DIRECTION_OPTIONS = [
  { value: "credit", labelKey: "credit" },
  { value: "debit", labelKey: "debit" },
];

/**
 * Audited manual wallet adjustment (PRD §5). A reason is mandatory and the
 * amount must be positive — the direction, not a sign, decides credit vs debit.
 */


export function AdjustBalanceDialog({ open, onOpenChange, userName, onConfirm, isPending = false }: AdjustBalanceDialogProps) {
  const { t } = useTranslation("administration");
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BalanceAdjustmentFormValues>({
    resolver: zodResolver(balanceAdjustmentSchema),
    defaultValues: { direction: "credit", amount: undefined, reason: "" },
  });

  useEffect(() => {
    if (open) reset({ direction: "credit", amount: undefined, reason: "" });
  }, [open, reset]);

  const onSubmit = (values: BalanceAdjustmentFormValues) => {
    onConfirm({ amount: values.amount, direction: values.direction, reason: values.reason.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>Adjust balance — {userName}</DialogTitle>
            <DialogDescription>{t("adjustSubtitle")}</DialogDescription>
          </DialogHeader>

          <Controller
            control={control}
            name="direction"
            render={({ field }) => (
              <SelectField
                id="adjust-direction"
                label={t("direction")}
                options={translateOptions(DIRECTION_OPTIONS, t)}
                value={field.value}
                onChange={field.onChange}
                error={errors.direction?.message}
                required
              />
            )}
          />

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="adjust-amount"
              required
            >{t("amount")}</FieldLabel>
            {/* No native `min` — a browser constraint would block the whole
                form submit before Zod ever runs, so the "must be > 0" message
                would never render. The schema owns that rule instead. */}
            <Input
              id="adjust-amount"
              type="number"
              className="rounded-xl"
              aria-required="true"
              placeholder={t("amountPlaceholder")}
              {...register("amount", { valueAsNumber: true })}
            />
            {errors.amount && (
              <Text
                variant="small"
                className="text-destructive"
              >
                {errors.amount.message}
              </Text>
            )}
          </Box>

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="adjust-reason"
              required
            >{t("reason")}</FieldLabel>
            <Textarea
              id="adjust-reason"
              className="rounded-xl"
              aria-required="true"
              placeholder={t("reasonPlaceholder")}
              {...register("reason")}
            />
            {errors.reason && (
              <Text
                variant="small"
                className="text-destructive"
              >
                {errors.reason.message}
              </Text>
            )}
          </Box>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
            >{t("cancel")}</Button>
            <Button
              type="submit"
              className="rounded-xl"
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Adjust Balance"}
            </Button>
          </DialogFooter>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
