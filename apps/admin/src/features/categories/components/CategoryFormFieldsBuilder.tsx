import { useTranslation } from "react-i18next";
import { Controller, useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { Info, Plus, Trash2 } from "lucide-react";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Text } from "@/components/common/Text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CategoryFormValues } from "../schemas/categoryForm.schema";
import { MAX_ORDER_FORM_FIELDS } from "../schemas/categoryForm.schema";

interface CategoryFormFieldsBuilderProps {
  control: Control<CategoryFormValues>;
  register: UseFormRegister<CategoryFormValues>;
  errors: FieldErrors<CategoryFormValues>;
}

/**
 * Dynamic, repeatable field-definition builder (product_requirements.md
 * §4.5) — each row defines one buyer-facing input the consumer top-up
 * site's order form shows for this category. `useFieldArray` from React
 * Hook Form; no precedent for it elsewhere in the codebase, introduced here.
 */
export function CategoryFormFieldsBuilder({ control, register, errors }: CategoryFormFieldsBuilderProps) {
  const { t } = useTranslation("categories");
  const { fields, append, remove } = useFieldArray({ control, name: "orderFormFields" });

  return (
    <Box className="flex flex-col gap-4">
      <Alert className="border-warning/40 bg-card text-warning [&>svg]:text-current *:data-[slot=alert-description]:text-warning/90">
        <Info />
        <AlertTitle>{t("fieldKeyGuide")}</AlertTitle>
        <AlertDescription>
          <Text as="p">{t("fieldKeyIntro")}</Text>
          <Text as="p">{t("fieldKeyExampleTitle")}</Text>
          <Box
            as="ol"
            className="list-decimal pl-5"
          >
            <Box as="li">
              <Text as="span">{t("fieldKeyExampleAccount")}</Text>
            </Box>
            <Box as="li">
              <Text as="span">{t("fieldKeyExampleServer")}</Text>
            </Box>
          </Box>
        </AlertDescription>
      </Alert>

      <Button
        type="button"
        variant="outline"
        className="w-fit self-end rounded-xl"
        disabled={fields.length >= MAX_ORDER_FORM_FIELDS}
        onClick={() => append({ key: "", label: "", required: false })}
      >
        <Plus className="size-4" />{t("addForm")}</Button>

      {fields.length === 0 ? (
        <Box className="rounded-xl border border-border bg-card p-10 text-center">
          <Text variant="muted">{t("noForms")}</Text>
        </Box>
      ) : (
        <Box className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <Box
              key={field.id}
              className="grid grid-cols-1 items-end gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
            >
              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor={`order-form-field-key-${index}`}
                  required
                >{t("key")}</FieldLabel>
                <Input
                  id={`order-form-field-key-${index}`}
                  aria-required="true"
                  placeholder="user_id"
                  {...register(`orderFormFields.${index}.key`)}
                />
                {errors.orderFormFields?.[index]?.key && (
                  <Text
                    variant="small"
                    className="text-destructive"
                  >
                    {errors.orderFormFields[index]?.key?.message}
                  </Text>
                )}
              </Box>

              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor={`order-form-field-label-${index}`}
                  optional
                >{t("label")}</FieldLabel>
                <Input
                  id={`order-form-field-label-${index}`}
                  placeholder={t("userIdPlaceholder")}
                  {...register(`orderFormFields.${index}.label`)}
                />
              </Box>

              <Box className="flex flex-col items-start gap-1.5">
                <Label htmlFor={`order-form-field-required-${index}`}>{t("required")}</Label>
                <Controller
                  control={control}
                  name={`orderFormFields.${index}.required`}
                  render={({ field: switchField }) => (
                    <Switch
                      id={`order-form-field-required-${index}`}
                      checked={switchField.value}
                      onCheckedChange={switchField.onChange}
                    />
                  )}
                />
              </Box>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove field ${index + 1}`}
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
