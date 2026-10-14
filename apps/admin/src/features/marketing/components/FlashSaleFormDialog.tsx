import { useTranslation } from "react-i18next";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Heading } from "@/components/common/Heading";
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
import { formatCurrency } from "@/utils/currency";
import { useCreateFlashSale, useFlashSale, useUpdateFlashSale } from "../hooks/useFlashSales";
import { useProductOptions } from "../hooks/useProductOptions";
import { flashSaleFormSchema, type FlashSaleFormValues } from "../schemas/flashSaleForm.schema";

/** `2026-08-02T07:34:13.000000Z` → `2026-08-02T07:34`, which datetime-local takes. */
const toInput = (value?: string) => (value ? value.slice(0, 16) : "");

interface FlashSaleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  flashSaleId?: string;
}

export function FlashSaleFormDialog({ open, onOpenChange, flashSaleId }: FlashSaleFormDialogProps) {
  const { t } = useTranslation("marketing");
  const isEdit = Boolean(flashSaleId);

  const { data: existing } = useFlashSale(open ? flashSaleId : undefined);
  const { options: productOptions, isLoading: productsLoading } = useProductOptions();
  const createFlashSale = useCreateFlashSale();
  const updateFlashSale = useUpdateFlashSale();
  const isPending = createFlashSale.isPending || updateFlashSale.isPending;

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FlashSaleFormValues>({
    resolver: zodResolver(flashSaleFormSchema),
    defaultValues: { name: "", startsAt: "", endsAt: "", isActive: true, items: [] },
    values: existing
      ? {
          name: existing.name,
          startsAt: toInput(existing.starts_at),
          endsAt: toInput(existing.ends_at),
          isActive: existing.is_active,
          items: existing.items.map((item) => ({
            productId: item.product_id,
            salePrice: item.sale_price,
            stockTotal: item.stock_total,
          })),
        }
      : undefined,
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items");

  const onSubmit = (values: FlashSaleFormValues) => {
    const payload = {
      name: values.name,
      starts_at: values.startsAt,
      ends_at: values.endsAt,
      is_active: values.isActive,
      items: values.items.map((item, index) => ({
        product_id: item.productId,
        sale_price: item.salePrice,
        stock_total: item.stockTotal,
        sort_order: index,
      })),
    };
    const onSuccess = () => onOpenChange(false);

    if (flashSaleId) {
      updateFlashSale.mutate({ id: flashSaleId, input: payload }, { onSuccess });
      return;
    }
    createFlashSale.mutate(payload, { onSuccess });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Flash Sale" : "Add Flash Sale"}</DialogTitle>
          <DialogDescription>{t("flashSaleFormSubtitle")}</DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          <Box className="flex flex-col gap-4">
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="flash-sale-name"
                required
              >{t("colName")}</FieldLabel>
              <Input
                id="flash-sale-name"
                className="rounded-xl"
                aria-required="true"
                placeholder={t("flashSaleNamePlaceholder")}
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

            <Box className="grid gap-4 sm:grid-cols-2">
              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="flash-sale-starts"
                  required
                >{t("starts")}</FieldLabel>
                <Input
                  id="flash-sale-starts"
                  type="datetime-local"
                  className="rounded-xl"
                  aria-required="true"
                  {...register("startsAt")}
                />
                {errors.startsAt && (
                  <Text
                    variant="small"
                    className="text-destructive"
                  >
                    {errors.startsAt.message}
                  </Text>
                )}
              </Box>
              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="flash-sale-ends"
                  required
                >{t("colEnds")}</FieldLabel>
                <Input
                  id="flash-sale-ends"
                  type="datetime-local"
                  className="rounded-xl"
                  aria-required="true"
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

            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Box className="flex items-center gap-3">
                  <Switch
                    id="flash-sale-active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="flash-sale-active">{t("active")}</Label>
                </Box>
              )}
            />
          </Box>

          <Box className="flex flex-col gap-4">
            <Box className="flex items-center justify-between">
              <Box className="flex flex-col gap-0.5">
                <Heading
                  level={2}
                  variant="subtitle"
                >{t("colProducts")}</Heading>
                <Text variant="muted">{t("discountDerivedHint")}</Text>
              </Box>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => append({ productId: "", salePrice: 0, stockTotal: 0 })}
              >
                <Plus className="size-4" />{t("addProduct")}</Button>
            </Box>

            {fields.length === 0 ? (
              <Box className="rounded-xl border border-dashed border-border p-6">
                <Text variant="muted">{t("noProducts")}</Text>
              </Box>
            ) : (
              fields.map((field, index) => {
                const selected = productOptions.find((option) => option.value === items?.[index]?.productId);
                const salePrice = items?.[index]?.salePrice ?? 0;
                const discount =
                  selected && selected.price > 0 && salePrice < selected.price
                    ? Math.round(((selected.price - salePrice) / selected.price) * 100)
                    : 0;

                return (
                  <Box
                    key={field.id}
                    className="flex flex-col gap-3 rounded-xl border border-border p-4"
                  >
                    <Box className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
                      <Controller
                        control={control}
                        name={`items.${index}.productId`}
                        render={({ field: productField }) => (
                          <SelectField
                            id={`flash-sale-product-${index}`}
                            label={t("product")}
                            options={productOptions}
                            value={productField.value}
                            onChange={productField.onChange}
                            error={errors.items?.[index]?.productId?.message}
                            disabled={productsLoading}
                            required
                          />
                        )}
                      />

                      <Box className="flex flex-col gap-1.5">
                        <FieldLabel
                          htmlFor={`flash-sale-price-${index}`}
                          required
                        >{t("salePrice")}</FieldLabel>
                        <Input
                          id={`flash-sale-price-${index}`}
                          type="number"
                          min={0}
                          className="rounded-xl tabular-nums"
                          aria-required="true"
                          {...register(`items.${index}.salePrice`, { valueAsNumber: true })}
                        />
                        {errors.items?.[index]?.salePrice && (
                          <Text
                            variant="small"
                            className="text-destructive"
                          >
                            {errors.items[index]?.salePrice?.message}
                          </Text>
                        )}
                      </Box>

                      <Box className="flex flex-col gap-1.5">
                        <FieldLabel
                          htmlFor={`flash-sale-stock-${index}`}
                          required
                        >{t("stock")}</FieldLabel>
                        <Input
                          id={`flash-sale-stock-${index}`}
                          type="number"
                          min={0}
                          className="rounded-xl tabular-nums"
                          aria-required="true"
                          {...register(`items.${index}.stockTotal`, { valueAsNumber: true })}
                        />
                        {errors.items?.[index]?.stockTotal && (
                          <Text
                            variant="small"
                            className="text-destructive"
                          >
                            {errors.items[index]?.stockTotal?.message}
                          </Text>
                        )}
                      </Box>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove product ${index + 1}`}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </Box>

                    {selected && (
                      <Text variant="muted">
                        Normally {formatCurrency(selected.price, { fractionDigits: 0 })}
                        {discount > 0 ? ` — ${discount}% off` : " — no discount at this price"}
                      </Text>
                    )}
                  </Box>
                );
              })
            )}
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
