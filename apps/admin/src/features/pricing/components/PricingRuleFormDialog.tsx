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
import { pricingRuleSchema, type PricingRuleFormValues } from "../schemas/pricingRule.schema";
import type { CategoryOption, PlanOption, PricingRule, PricingRuleInput } from "../types/pricingRule.type";

interface PricingRuleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: PricingRule | null;
  categoryOptions: CategoryOption[];
  planOptions: PlanOption[];
  onSubmit: (input: PricingRuleInput) => void;
  isPending?: boolean;
}

// Radix Select forbids an empty-string item value, so "applies to everything"
// uses a sentinel that maps back to `null` on submit. Both selects need one:
// a null category means every category, a null plan means every plan.
const GLOBAL_VALUE = "__global__";

export function PricingRuleFormDialog({ open, onOpenChange, rule, categoryOptions, planOptions, onSubmit, isPending = false }: PricingRuleFormDialogProps) {
  const { t } = useTranslation("pricing");
  // Built here, not at module scope: the labels are rendered text.
  const GLOBAL = { value: GLOBAL_VALUE, label: t("allCategories") };
  const ALL_PLANS = { value: GLOBAL_VALUE, label: t("allPlansFallback") };
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PricingRuleFormValues>({
    resolver: zodResolver(pricingRuleSchema),
    defaultValues: { category_id: GLOBAL_VALUE, membership_plan_id: GLOBAL_VALUE, markup_percent: 0, markup_flat: 0 },
  });

  useEffect(() => {
    if (!open) return;
    reset(
      rule
        ? {
            category_id: rule.category_id !== null ? String(rule.category_id) : GLOBAL_VALUE,
            membership_plan_id: rule.membership_plan_id !== null ? String(rule.membership_plan_id) : GLOBAL_VALUE,
            markup_percent: rule.markup_percent,
            markup_flat: rule.markup_flat,
          }
        : { category_id: GLOBAL_VALUE, membership_plan_id: GLOBAL_VALUE, markup_percent: 0, markup_flat: 0 },
    );
  }, [open, rule, reset]);

  const submit = (values: PricingRuleFormValues) => {
    onSubmit({
      category_id: values.category_id === GLOBAL_VALUE ? null : Number(values.category_id),
      membership_plan_id: values.membership_plan_id === GLOBAL_VALUE ? null : Number(values.membership_plan_id),
      markup_percent: values.markup_percent,
      markup_flat: values.markup_flat,
    });
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
          onSubmit={handleSubmit(submit)}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{rule ? "Edit Pricing Rule" : "Add Pricing Rule"}</DialogTitle>
            <DialogDescription>
              Sets the markup applied over supplier cost for a membership plan. Price = ⌈cost × (1 + %/100)⌉ + flat.
              A rule with no plan applies to every plan that has none of its own.
            </DialogDescription>
          </DialogHeader>

          <Controller
            control={control}
            name="membership_plan_id"
            render={({ field }) => (
              <SelectField
                id="rule-plan"
                label={t("membershipPlan")}
                options={[ALL_PLANS, ...planOptions.map(({ value, label }) => ({ value, label }))]}
                value={field.value}
                onChange={field.onChange}
                error={errors.membership_plan_id?.message}
                optional
              />
            )}
          />

          <Controller
            control={control}
            name="category_id"
            render={({ field }) => (
              <SelectField
                id="rule-category"
                label={t("category")}
                options={[GLOBAL, ...categoryOptions]}
                value={field.value}
                onChange={field.onChange}
                placeholder={t("allCategories")}
                optional
              />
            )}
          />

          <Box className="grid grid-cols-2 gap-3">
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="rule-percent"
                required
              >{t("markupPercent")}</FieldLabel>
              <Input
                id="rule-percent"
                type="number"
                step="any"
                className="rounded-xl"
                aria-required="true"
                placeholder={t("markupPlaceholder")}
                {...register("markup_percent", { valueAsNumber: true })}
              />
              {errors.markup_percent && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.markup_percent.message}
                </Text>
              )}
            </Box>
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="rule-flat"
                required
              >{t("flatMarkup")}</FieldLabel>
              <Input
                id="rule-flat"
                type="number"
                className="rounded-xl"
                aria-required="true"
                placeholder={t("flatPlaceholder")}
                {...register("markup_flat", { valueAsNumber: true })}
              />
              {errors.markup_flat && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.markup_flat.message}
                </Text>
              )}
            </Box>
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
              {isPending ? "Saving..." : rule ? "Save" : "Add Rule"}
            </Button>
          </DialogFooter>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
