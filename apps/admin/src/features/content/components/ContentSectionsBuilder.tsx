import { useTranslation } from "react-i18next";
import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ArticleFormValues } from "../schemas/contentForms.schema";

/** Both the article and page forms carry a `sections` array of the same shape. */
interface SectionsFormValues {
  sections: ArticleFormValues["sections"];
}

interface ContentSectionsBuilderProps {
  control: Control<never>;
  register: UseFormRegister<never>;
  errors: FieldErrors<SectionsFormValues>;
  /** Article bodies require a section; a page's can legitimately be empty. */
  requireOne?: boolean;
}

/**
 * Repeatable body-section editor.
 *
 * The API stores a body as `[{heading?, paragraphs[]}]` rather than HTML,
 * because that is the shape the storefront's renderer consumes. Editing an
 * array of paragraphs as separate inputs would be tedious, so each section is
 * one textarea and paragraphs are split on blank lines when the form is
 * submitted — the same convention writers already expect.
 */
export function ContentSectionsBuilder({ control, register, errors, requireOne = true }: ContentSectionsBuilderProps) {
  const { t } = useTranslation("content");
  const { fields, append, remove } = useFieldArray({ control, name: "sections" as never });

  return (
    <Box className="flex flex-col gap-4">
      <Box className="flex items-center justify-between">
        <Box className="flex flex-col gap-0.5">
          <Label>{t("bodySections")}</Label>
          <Text variant="muted">{t("bodySectionsHint")}</Text>
        </Box>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={() => append({ heading: "", body: "" } as never)}
        >
          <Plus className="size-4" />{t("addSection")}</Button>
      </Box>

      {fields.length === 0 ? (
        <Box className="rounded-xl border border-dashed border-border p-6">
          <Text variant="muted">
            {requireOne ? "Add at least one section to publish this." : "No sections yet."}
          </Text>
        </Box>
      ) : (
        fields.map((field, index) => (
          <Box
            key={field.id}
            className="flex flex-col gap-3 rounded-xl border border-border p-4"
          >
            <Box className="flex items-end justify-between gap-3">
              <Box className="flex flex-1 flex-col gap-1.5">
                <FieldLabel
                  htmlFor={`section-heading-${index}`}
                  optional
                >{t("heading")}</FieldLabel>
                <Input
                  id={`section-heading-${index}`}
                  className="rounded-xl"
                  placeholder={t("headingPlaceholder")}
                  {...register(`sections.${index}.heading` as never)}
                />
              </Box>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove section ${index + 1}`}
                onClick={() => remove(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </Box>

            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor={`section-body-${index}`}
                required
              >{t("content")}</FieldLabel>
              <Textarea
                id={`section-body-${index}`}
                rows={5}
                className="rounded-xl"
                aria-required="true"
                placeholder={t("sectionPlaceholder")}
                {...register(`sections.${index}.body` as never)}
              />
              {errors.sections?.[index]?.body && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.sections[index]?.body?.message}
                </Text>
              )}
            </Box>
          </Box>
        ))
      )}

      {typeof errors.sections?.message === "string" && (
        <Text
          variant="small"
          className="text-destructive"
        >
          {errors.sections.message}
        </Text>
      )}
    </Box>
  );
}
