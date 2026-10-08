import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { Controller, useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Box } from "@/components/common/Box";
import { SelectField } from "@/components/common/SelectField";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { digitsOnly } from "@/lib/numericInput";
import { useProductList } from "../hooks/useProducts";
import { numericRegister } from "../lib/numericRegister";
import type { ProductFormValues } from "../schemas/productForm.schema";

interface ProductMixBuilderProps {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  /** Excluded from the picker — a bundle that contains itself is a loop. */
  currentProductId?: string;
}

/**
 * Repeatable rows for the Product Mix section: which product goes into the
 * bundle, and how many of it.
 *
 * The picker lists the **main products this site actually sells**, fetched from
 * the catalogue. It used to offer `SUPPLIER_PRODUCT_OPTIONS`, a bundled
 * constant of five invented supplier SKUs that matched nothing in the database —
 * so every row an admin built referenced a product that did not exist.
 */
export function ProductMixBuilder({ control, register, errors, currentProductId }: ProductMixBuilderProps) {
  const { t } = useTranslation("products");
  const { fields, append, remove } = useFieldArray({ control, name: "productMix" });
  // One page is plenty for a picker; the list is searchable in its own screen.
  const { data, isLoading } = useProductList({ per_page: 100 });

  const options = useMemo(
    () =>
      (data?.data ?? [])
        .filter((product) => product.id !== currentProductId)
        .map((product) => ({
          value: product.id,
          label: `${product.name} — ${product.code}`,
        })),
    [data, currentProductId],
  );

  return (
    <Box className="flex flex-col gap-3">
      {/* `type="button"`: this fills the field array, it must never submit the
          outer product form. Right-aligned, where the frame puts it. */}
      <Button
        type="button"
        variant="outline"
        className="w-fit self-end rounded-xl"
        onClick={() => append({ mainProduct: "", quantity: "" })}
      >
        <Plus className="size-4" />{t("addMix")}</Button>

      {fields.length === 0 ? (
        <Box className="rounded-xl border border-border bg-card p-10 text-center">
          <Text variant="muted">{t("noProductMix")}</Text>
        </Box>
      ) : (
        <Box className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <Box
              key={field.id}
              className="grid grid-cols-1 items-end gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <Controller
                control={control}
                name={`productMix.${index}.mainProduct`}
                render={({ field: select }) => (
                  <SelectField
                    id={`product-mix-product-${index}`}
                    label={t("mainProduct")}
                    options={options}
                    disabled={isLoading}
                    emptyLabel={isLoading ? "Loading products..." : "No products available"}
                    value={select.value}
                    onChange={select.onChange}
                    error={errors.productMix?.[index]?.mainProduct?.message}
                  />
                )}
              />

              <Box className="flex flex-col gap-1.5">
                <Label htmlFor={`product-mix-quantity-${index}`}>{t("quantity")}</Label>
                <Input
                  id={`product-mix-quantity-${index}`}
                  className="rounded-xl"
                  inputMode="numeric"
                  placeholder="1"
                  {...numericRegister(register, `productMix.${index}.quantity`, digitsOnly)}
                />
                {errors.productMix?.[index]?.quantity && (
                  <Text
                    variant="small"
                    className="text-destructive"
                  >
                    {errors.productMix?.[index]?.quantity?.message}
                  </Text>
                )}
              </Box>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                // Numbered so a screen reader (and a test) can tell two rows apart.
                aria-label={`Remove mix ${index + 1}`}
                className="rounded-xl"
                onClick={() => remove(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
