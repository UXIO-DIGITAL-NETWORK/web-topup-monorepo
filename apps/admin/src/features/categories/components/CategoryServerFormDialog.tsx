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
import { CategoryServerOptionsBuilder } from "./CategoryServerOptionsBuilder";
import { useCategoryOptions } from "../hooks/useCategoryOptions";
import { useCategoryServer, useCreateCategoryServer, useUpdateCategoryServer } from "../hooks/useCategoryServers";
import { categoryServerFormSchema, type CategoryServerFormValues } from "../schemas/categoryServerForm.schema";

const EMPTY_VALUES: CategoryServerFormValues = { category_id: "", name: "", options: [] };

interface CategoryServerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  categoryServerId?: string;
}

/**
 * Add / Edit Category Server (product_requirements.md §4.5, line 235), as a
 * modal. The reference's copy-pasted "Category Type Name" label is corrected
 * to "Category Server Name" here.
 */
export function CategoryServerFormDialog({ open, onOpenChange, categoryServerId }: CategoryServerFormDialogProps) {
  const { t } = useTranslation("categories");
  const isEdit = Boolean(categoryServerId);

  const { data: existing } = useCategoryServer(open ? categoryServerId : undefined);
  const { options: categoryOptions, isLoading: categoriesLoading } = useCategoryOptions();
  const createCategoryServer = useCreateCategoryServer();
  const updateCategoryServer = useUpdateCategoryServer();
  const isPending = createCategoryServer.isPending || updateCategoryServer.isPending;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryServerFormValues>({
    resolver: zodResolver(categoryServerFormSchema),
    defaultValues: EMPTY_VALUES,
    // `values` (not `defaultValues`) so the form re-syncs once the record
    // resolves — on edit it is undefined for the first render.
    values: existing
      ? { category_id: existing.category_id, name: existing.name, options: existing.options }
      : undefined,
  });

  const onSubmit = (values: CategoryServerFormValues) => {
    const payload = { category_id: values.category_id, name: values.name, options: values.options };
    const onSuccess = () => onOpenChange(false);

    if (categoryServerId) {
      updateCategoryServer.mutate({ id: categoryServerId, input: payload }, { onSuccess });
      return;
    }
    createCategoryServer.mutate(payload, { onSuccess });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Category Server" : "Add Category Server"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Rename this category server or adjust the options buyers can choose from."
              : "Name a set of server or region options buyers can choose from when ordering."}
          </DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <Controller
            control={control}
            name="category_id"
            render={({ field }) => (
              <SelectField
                id="category-server-category"
                label={t("category")}
                options={categoryOptions}
                value={field.value}
                onChange={field.onChange}
                error={errors.category_id?.message}
                disabled={categoriesLoading}
                emptyLabel={categoriesLoading ? "Loading categories..." : "No categories available"}
                required
              />
            )}
          />

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="category-server-name"
              required
            >{t("serverNameLabel")}</FieldLabel>
            <Input
              id="category-server-name"
              className="rounded-xl"
              aria-required="true"
              placeholder={t("serverNamePlaceholder")}
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

          <CategoryServerOptionsBuilder
            control={control}
            register={register}
            errors={errors}
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
