import { useTranslation } from "react-i18next";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCategoryType, useCreateCategoryType, useUpdateCategoryType } from "../hooks/useCategoryTypes";
import { categoryTypeFormSchema, type CategoryTypeFormValues } from "../schemas/categoryTypeForm.schema";

const EMPTY_VALUES: CategoryTypeFormValues = { name: "", isVoucher: false };

interface CategoryTypeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  categoryTypeId?: string;
}

/**
 * Add / Edit Category Type (product_requirements.md §4.5), as a modal. The
 * checkbox label and helper text are the one deliberately-written part of the
 * reference and are used verbatim.
 */
export function CategoryTypeFormDialog({ open, onOpenChange, categoryTypeId }: CategoryTypeFormDialogProps) {
  const { t } = useTranslation("categories");
  const isEdit = Boolean(categoryTypeId);

  const { data: existing } = useCategoryType(open ? categoryTypeId : undefined);
  const createCategoryType = useCreateCategoryType();
  const updateCategoryType = useUpdateCategoryType();
  const isPending = createCategoryType.isPending || updateCategoryType.isPending;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryTypeFormValues>({
    resolver: zodResolver(categoryTypeFormSchema),
    defaultValues: EMPTY_VALUES,
    // `values` (not `defaultValues`) so the form re-syncs once the record
    // resolves — on edit it is undefined for the first render.
    values: existing ? { name: existing.name, isVoucher: existing.is_voucher } : undefined,
  });

  const onSubmit = (values: CategoryTypeFormValues) => {
    const payload = { name: values.name, is_voucher: values.isVoucher, status: "active" as const };
    const onSuccess = () => onOpenChange(false);

    if (categoryTypeId) {
      // Status is owned by the row menu's Deactive/Activate action, so an
      // edit must not reset it.
      updateCategoryType.mutate(
        { id: categoryTypeId, input: { name: values.name, is_voucher: values.isVoucher } },
        { onSuccess },
      );
      return;
    }
    createCategoryType.mutate(payload, { onSuccess });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Category Type" : "Add Category Type"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Rename this category type or change whether it sells vouchers."
              : "Define how a group of categories is classified, and whether it sells vouchers or digital codes."}
          </DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="category-type-name"
              required
            >{t("typeNameLabel")}</FieldLabel>
            <Input
              id="category-type-name"
              className="rounded-xl"
              aria-required="true"
              placeholder={t("typeNamePlaceholder")}
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

          <Controller
            control={control}
            name="isVoucher"
            render={({ field }) => (
              <Box className="flex flex-col gap-1.5">
                <Box className="flex items-center gap-2">
                  <Checkbox
                    id="category-type-is-voucher"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <Label htmlFor="category-type-is-voucher">{t("isVoucher")}</Label>
                </Box>
                <Text
                  variant="small"
                  className="text-muted-foreground"
                >{t("isVoucherHint")}</Text>
              </Box>
            )}
          />

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
