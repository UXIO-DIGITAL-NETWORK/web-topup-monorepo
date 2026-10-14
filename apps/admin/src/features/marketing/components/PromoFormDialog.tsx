import { translateOptions } from "@/lib/i18nOptions";
import { useTranslation } from "react-i18next";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePromo, usePromo, useUpdatePromo } from "../hooks/usePromos";
import { promoFormSchema, type PromoFormValues } from "../schemas/promoForm.schema";

const TYPE_OPTIONS = [
  { value: "percentage", labelKey: "percentage" },
  { value: "fixed", labelKey: "fixedAmount" },
];

/** `2026-08-30T09:00:00.000000Z` → `2026-08-30`, which is what a date input takes. */
const toDateInput = (value?: string) => (value ? value.slice(0, 10) : "");

interface PromoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  promoId?: string;
}



export function PromoFormDialog({ open, onOpenChange, promoId }: PromoFormDialogProps) {
  const { t } = useTranslation("marketing");
  const isEdit = Boolean(promoId);

  const { data: existing } = usePromo(open ? promoId : undefined);
  const createPromo = useCreatePromo();
  const updatePromo = useUpdatePromo();
  const isPending = createPromo.isPending || updatePromo.isPending;

  const {
    control,
    register,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<PromoFormValues>({
    resolver: zodResolver(promoFormSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      type: "percentage",
      value: 10,
      minPurchase: 0,
      isPublic: false,
      isActive: true,
    },
    values: existing
      ? {
          code: existing.code,
          name: existing.name,
          description: existing.description ?? "",
          type: existing.type,
          value: existing.value,
          maxDiscount: existing.max_discount,
          minPurchase: existing.min_purchase,
          quotaTotal: existing.quota_total,
          quotaPerUser: existing.quota_per_user,
          startsAt: toDateInput(existing.starts_at),
          endsAt: toDateInput(existing.ends_at),
          isPublic: existing.is_public,
          isActive: existing.is_active,
        }
      : undefined,
  });

  const type = watch("type");

  const onSubmit = (values: PromoFormValues) => {
    const payload = {
      code: values.code,
      name: values.name,
      description: values.description || undefined,
      type: values.type,
      value: values.value,
      // Only meaningful for a percentage — a fixed discount is already a cap.
      max_discount: values.type === "percentage" ? values.maxDiscount : undefined,
      min_purchase: values.minPurchase,
      scope: "global" as const,
      quota_total: values.quotaTotal,
      quota_per_user: values.quotaPerUser,
      starts_at: values.startsAt || undefined,
      ends_at: values.endsAt || undefined,
      is_public: values.isPublic,
      is_active: values.isActive,
    };
    const onSuccess = () => onOpenChange(false);

    if (promoId) {
      updatePromo.mutate({ id: promoId, input: payload }, { onSuccess });
      return;
    }
    createPromo.mutate(payload as never, { onSuccess });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Promo" : "Add Promo"}</DialogTitle>
          <DialogDescription>{t("promoFormSubtitle")}</DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <Box className="grid gap-4 sm:grid-cols-2">
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="promo-code"
                required
              >{t("colCode")}</FieldLabel>
              <Input
                id="promo-code"
                className="rounded-xl uppercase tracking-wider"
                aria-required="true"
                placeholder={t("promoCodePlaceholder")}
                {...register("code")}
              />
              {errors.code && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.code.message}
                </Text>
              )}
            </Box>
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="promo-name"
                required
              >{t("colName")}</FieldLabel>
              <Input
                id="promo-name"
                className="rounded-xl"
                aria-required="true"
                placeholder={t("promoNamePlaceholder")}
                {...register("name")}
              />
              {errors.name && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.name.message}
                </Text>
              )}
            </Box>
          </Box>

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="promo-description"
              optional
            >{t("description")}</FieldLabel>
            <Textarea
              id="promo-description"
              rows={2}
              className="rounded-xl"
              {...register("description")}
            />
          </Box>

          <Box className="grid gap-4 sm:grid-cols-3">
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <SelectField
                  id="promo-type"
                  label={t("type")}
                  options={translateOptions(TYPE_OPTIONS, t)}
                  value={field.value}
                  onChange={field.onChange}
                  required
                />
              )}
            />
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="promo-value"
                required
              >
                {type === "percentage" ? "Percentage" : "Amount"}
              </FieldLabel>
              <Input
                id="promo-value"
                type="number"
                min={1}
                className="rounded-xl tabular-nums"
                aria-required="true"
                {...register("value", { valueAsNumber: true })}
              />
              {errors.value && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.value.message}
                </Text>
              )}
            </Box>
            {type === "percentage" && (
              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="promo-max"
                  optional
                >{t("maxDiscount")}</FieldLabel>
                <Input
                  id="promo-max"
                  type="number"
                  min={0}
                  className="rounded-xl tabular-nums"
                  {...register("maxDiscount", { valueAsNumber: true })}
                />
              </Box>
            )}
          </Box>

          <Box className="grid gap-4 sm:grid-cols-3">
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="promo-min"
                required
              >{t("colMinPurchase")}</FieldLabel>
              <Input
                id="promo-min"
                type="number"
                min={0}
                className="rounded-xl tabular-nums"
                aria-required="true"
                {...register("minPurchase", { valueAsNumber: true })}
              />
              {errors.minPurchase && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.minPurchase.message}
                </Text>
              )}
            </Box>
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="promo-quota"
                optional
              >{t("totalQuota")}</FieldLabel>
              <Input
                id="promo-quota"
                type="number"
                min={0}
                placeholder={t("unlimited")}
                className="rounded-xl tabular-nums"
                {...register("quotaTotal", { valueAsNumber: true })}
              />
            </Box>
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="promo-quota-user"
                optional
              >{t("quotaPerUser")}</FieldLabel>
              <Input
                id="promo-quota-user"
                type="number"
                min={0}
                placeholder={t("unlimited")}
                className="rounded-xl tabular-nums"
                {...register("quotaPerUser", { valueAsNumber: true })}
              />
            </Box>
          </Box>

          <Box className="grid gap-4 sm:grid-cols-2">
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="promo-starts"
                optional
              >{t("starts")}</FieldLabel>
              <Input
                id="promo-starts"
                type="date"
                className="rounded-xl"
                {...register("startsAt")}
              />
            </Box>
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="promo-ends"
                optional
              >{t("colEnds")}</FieldLabel>
              <Input
                id="promo-ends"
                type="date"
                className="rounded-xl"
                {...register("endsAt")}
              />
              {errors.endsAt && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.endsAt.message}
                </Text>
              )}
            </Box>
          </Box>

          <Box className="flex flex-col gap-3 sm:flex-row sm:gap-8">
            <Controller
              control={control}
              name="isPublic"
              render={({ field }) => (
                <Box className="flex items-center gap-3">
                  <Switch
                    id="promo-public"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="promo-public">{t("advertise")}</Label>
                </Box>
              )}
            />
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Box className="flex items-center gap-3">
                  <Switch
                    id="promo-active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="promo-active">{t("active")}</Label>
                </Box>
              )}
            />
          </Box>

          <Box className="flex justify-end gap-3">
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
              {isPending ? "Saving..." : "Save"}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
