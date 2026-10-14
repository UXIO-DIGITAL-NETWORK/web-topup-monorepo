import { useTranslation } from "react-i18next";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
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
import { useArticleCategory, useCreateArticleCategory, useUpdateArticleCategory } from "../hooks/useArticleCategories";
import { articleCategoryFormSchema, type ArticleCategoryFormValues } from "../schemas/contentForms.schema";

interface ArticleCategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  articleCategoryId?: string;
}

export function ArticleCategoryFormDialog({ open, onOpenChange, articleCategoryId }: ArticleCategoryFormDialogProps) {
  const { t } = useTranslation("content");
  const isEdit = Boolean(articleCategoryId);

  const { data: existing } = useArticleCategory(open ? articleCategoryId : undefined);
  const createCategory = useCreateArticleCategory();
  const updateCategory = useUpdateArticleCategory();
  const isPending = createCategory.isPending || updateCategory.isPending;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ArticleCategoryFormValues>({
    resolver: zodResolver(articleCategoryFormSchema),
    defaultValues: { name: "", key: "", sortOrder: 0, status: true },
    values: existing
      ? { name: existing.name, key: existing.key, sortOrder: existing.sort_order, status: existing.status }
      : undefined,
  });

  const onSubmit = (values: ArticleCategoryFormValues) => {
    const payload = { name: values.name, key: values.key, sort_order: values.sortOrder, status: values.status };
    const onSuccess = () => onOpenChange(false);

    if (articleCategoryId) {
      updateCategory.mutate({ id: articleCategoryId, input: payload }, { onSuccess });
      return;
    }
    createCategory.mutate(payload, { onSuccess });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Category" : "Add Category"}</DialogTitle>
          <DialogDescription>{t("articleCategorySubtitle")}</DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <Box className="grid gap-4 sm:grid-cols-2">
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="article-category-name"
                required
              >{t("name")}</FieldLabel>
              <Input
                id="article-category-name"
                className="rounded-xl"
                aria-required="true"
                placeholder={t("articleCategoryNamePlaceholder")}
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

            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="article-category-key"
                required
              >{t("colKey")}</FieldLabel>
              <Input
                id="article-category-key"
                className="rounded-xl"
                aria-required="true"
                placeholder={t("keyPlaceholder")}
                {...register("key")}
              />
              {errors.key ? (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.key.message}
                </Text>
              ) : (
                <Text variant="muted">{t("keyHint")}</Text>
              )}
            </Box>
          </Box>

          <Box className="grid gap-4 sm:grid-cols-2">
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="article-category-order"
                required
              >{t("order")}</FieldLabel>
              <Input
                id="article-category-order"
                placeholder={t("sortOrderPlaceholder")}
                type="number"
                min={0}
                className="rounded-xl tabular-nums"
                aria-required="true"
                {...register("sortOrder", { valueAsNumber: true })}
              />
              {errors.sortOrder && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.sortOrder.message}
                </Text>
              )}
            </Box>

            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Box className="flex items-center gap-3 pt-7">
                  <Switch
                    id="article-category-status"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="article-category-status">{t("active")}</Label>
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
