import { useTranslation } from "react-i18next";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { ImageDropzone } from "@/components/common/ImageDropzone";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCategoryList } from "../hooks/useCategories";
import { useCreateSubCategory, useSubCategory, useUpdateSubCategory } from "../hooks/useSubCategories";
import { DESCRIPTION_MAX, subCategoryFormSchema, type SubCategoryFormValues } from "../schemas/subCategoryForm.schema";

const CATEGORY_OPTIONS_PAGE_SIZE = 100;
const EMPTY_VALUES: SubCategoryFormValues = { categoryId: "", name: "", currencyName: "", description: "" };

interface SubCategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  subCategoryId?: string;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text
      variant="small"
      className="text-destructive"
    >
      {message}
    </Text>
  );
}

/**
 * Add / Edit Sub Category (product_requirements.md §4.5, line 210) — one form
 * for both, as a modal. Real hints replace the reference's lorem ipsum, and
 * the description counter's percentage is derived from the actual length.
 */
export function SubCategoryFormDialog({ open, onOpenChange, subCategoryId }: SubCategoryFormDialogProps) {
  const { t } = useTranslation("categories");
  const isEdit = Boolean(subCategoryId);

  const { data: categories } = useCategoryList({ per_page: CATEGORY_OPTIONS_PAGE_SIZE });
  const { data: existing } = useSubCategory(open ? subCategoryId : undefined);

  const createSubCategory = useCreateSubCategory();
  const updateSubCategory = useUpdateSubCategory();
  const isPending = createSubCategory.isPending || updateSubCategory.isPending;

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SubCategoryFormValues>({
    resolver: zodResolver(subCategoryFormSchema),
    defaultValues: EMPTY_VALUES,
    // `values` (not `defaultValues`) so the form re-syncs once the record
    // resolves — on edit it is undefined for the first render.
    values: existing
      ? {
          categoryId: existing.category_id,
          name: existing.name,
          currencyName: existing.currency_name,
          description: existing.description ?? "",
        }
      : undefined,
  });

  const descriptionLength = (watch("description") ?? "").length;
  const descriptionPercent = Math.round((descriptionLength / DESCRIPTION_MAX) * 100);

  const onSubmit = (values: SubCategoryFormValues) => {
    const payload = {
      category_id: values.categoryId,
      name: values.name,
      currency_name: values.currencyName,
      // The file itself, not its name: the service turns this into the multipart
      // `logo` part the API stores. Null when nothing was picked — the field is
      // optional on both sides.
      logo: values.logo ?? null,
      description: values.description || undefined,
      status: "active" as const,
    };
    const onSuccess = () => onOpenChange(false);

    if (subCategoryId) {
      updateSubCategory.mutate({ id: subCategoryId, input: payload }, { onSuccess });
      return;
    }
    createSubCategory.mutate(payload, { onSuccess });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Sub Category" : "Add Sub Category"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this sub category's parent, currency, and storefront details."
              : "Group a category's currencies or item types into a sub category buyers can pick from."}
          </DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="sub-category-parent"
                  required
                >{t("category")}</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger
                    id="sub-category-parent"
                    aria-required="true"
                    className="w-full rounded-xl"
                  >
                    <SelectValue placeholder={t("selectCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories?.data ?? []).map((category) => (
                      <SelectItem
                        key={category.id}
                        value={category.id}
                      >
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.categoryId?.message} />
              </Box>
            )}
          />

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="sub-category-name"
              required
            >{t("subCategoryName")}</FieldLabel>
            <Input
              id="sub-category-name"
              className="rounded-xl"
              aria-required="true"
              placeholder={t("subCategoryNamePlaceholder")}
              {...register("name")}
            />
            <FieldError message={errors.name?.message} />
          </Box>

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="sub-category-currency-name"
              required
            >{t("colCurrencyName")}</FieldLabel>
            <Input
              id="sub-category-currency-name"
              className="rounded-xl"
              aria-required="true"
              placeholder={t("currencyPlaceholder")}
              {...register("currencyName")}
            />
            <FieldError message={errors.currencyName?.message} />
          </Box>

          <Controller
            control={control}
            name="logo"
            render={({ field }) => (
              <ImageDropzone
                id="sub-category-logo"
                label={t("logo")}
                accept="image/jpeg,image/jpg,image/png,image/webp"
                formatsLabel="JPG, JPEG, PNG, WEBP up to 10mb"
                caption={t("logoCaption")}
                value={field.value}
                onChange={field.onChange}
                error={errors.logo?.message}
                uploading={isPending}
                optional
              />
            )}
          />

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="sub-category-description"
              optional
            >{t("description")}</FieldLabel>
            <Textarea
              id="sub-category-description"
              className="rounded-xl"
              placeholder={t("subCategoryDescriptionPlaceholder")}
              maxLength={DESCRIPTION_MAX}
              {...register("description")}
            />
            <FieldError message={errors.description?.message} />
            <Box className="flex justify-between">
              <Text variant="small">
                {descriptionLength}/{DESCRIPTION_MAX} characters
              </Text>
              <Text variant="small">{descriptionPercent}% used</Text>
            </Box>
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
