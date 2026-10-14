import { useTranslation } from "react-i18next";
import { useState } from "react";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategoryTypeOptions } from "../hooks/useCategoryTypeOptions";
import { useQuickCreateCategory } from "../hooks/useCategories";
import { slugify } from "../lib/slugify";
import type { Category } from "../types/category.type";

interface InlineCategoryCreateProps {
  onCreated: (category: Category) => void;
  onCancel: () => void;
}

/** The three fields `POST /v1/categories` actually requires, plus a derived slug. */
const EMPTY = { typeId: "", name: "", code: "" };

/**
 * Create a category without leaving the Category Provider dialog.
 *
 * Two constraints shape this:
 *
 * 1. **It is not a `<form>`.** The dialog around it already is one, and nested
 *    forms are invalid HTML — the inner submit would bubble out and save the
 *    outer dialog instead. Everything here is a `type="button"`.
 * 2. **Its validation is local, not part of the parent's zod schema.** A blank
 *    field here must never block the dialog's own Save; this panel is optional.
 *
 * Only the API's true minimum is asked for (type, name, code). Everything else —
 * logo, description, SEO, the order form — is nullable server-side and belongs in
 * the full Category form, which is where an admin will finish the record.
 */
export function InlineCategoryCreate({ onCreated, onCancel }: InlineCategoryCreateProps) {
  const { t } = useTranslation("categories");
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { options: typeOptions, isLoading: typesLoading } = useCategoryTypeOptions();
  const quickCreate = useQuickCreateCategory();

  const set = (key: keyof typeof EMPTY, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setSubmitError(null);
  };

  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!values.typeId) nextErrors.typeId = "Category Type is required";
    if (!values.name.trim()) nextErrors.name = "Category Name is required";
    if (!values.code.trim()) nextErrors.code = "Category Code is required";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    quickCreate.mutate(
      {
        type_id: values.typeId,
        name: values.name.trim(),
        code: values.code.trim(),
        slug: slugify(values.name),
      },
      {
        onSuccess: (category) => {
          setValues(EMPTY);
          onCreated(category);
        },
        onError: () => {
          // `code` and `slug` are unique server-side, so the common failure is a
          // clash. Surfacing it here — rather than as a toast — keeps the fix next
          // to the field that caused it.
          setSubmitError("Could not create the category. The code may already be taken.");
        },
      },
    );
  };

  return (
    <Box className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4">
      <Text
        variant="small"
        className="text-muted-foreground"
      >{t("inlineCreateHint")}</Text>

      <Box className="flex flex-col gap-1.5">
        <FieldLabel
          htmlFor="inline-category-type"
          required
        >{t("colCategoryType")}</FieldLabel>
        <Select
          value={values.typeId}
          onValueChange={(value) => set("typeId", value)}
        >
          <SelectTrigger
            id="inline-category-type"
            aria-required="true"
            className="w-full rounded-xl"
          >
            <SelectValue placeholder={typesLoading ? "Loading types..." : "Select a category type"} />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.typeId && (
          <Text
            variant="small"
            className="text-destructive"
          >
            {errors.typeId}
          </Text>
        )}
      </Box>

      <Box className="flex flex-col gap-1.5">
        <FieldLabel
          htmlFor="inline-category-name"
          required
        >{t("colCategoryName")}</FieldLabel>
        <Input
          id="inline-category-name"
          value={values.name}
          onChange={(event) => set("name", event.target.value)}
          placeholder={t("nameExample")}
          aria-required="true"
          className="rounded-xl"
        />
        {errors.name && (
          <Text
            variant="small"
            className="text-destructive"
          >
            {errors.name}
          </Text>
        )}
      </Box>

      <Box className="flex flex-col gap-1.5">
        <FieldLabel
          htmlFor="inline-category-code"
          required
        >{t("categoryCode")}</FieldLabel>
        <Input
          id="inline-category-code"
          value={values.code}
          onChange={(event) => set("code", event.target.value)}
          placeholder={t("codeExample")}
          aria-required="true"
          className="rounded-xl"
        />
        <Text
          variant="small"
          className="text-muted-foreground"
        >{t("categoryCodeHint")}</Text>
        {errors.code && (
          <Text
            variant="small"
            className="text-destructive"
          >
            {errors.code}
          </Text>
        )}
      </Box>

      {submitError && (
        <Text
          variant="small"
          className="text-destructive"
        >
          {submitError}
        </Text>
      )}

      <Box className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-xl"
          onClick={onCancel}
        >{t("cancel")}</Button>
        <Button
          type="button"
          size="sm"
          className="rounded-xl"
          disabled={quickCreate.isPending}
          onClick={handleSave}
        >
          {quickCreate.isPending ? "Creating..." : "Create category"}
        </Button>
      </Box>
    </Box>
  );
}
