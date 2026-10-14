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
import { useCreateFaq, useFaq, useUpdateFaq } from "../hooks/useFaqs";
import { faqFormSchema, type FaqFormValues } from "../schemas/contentForms.schema";

const LOCALE_OPTIONS = [
  { value: "id", labelKey: "indonesian" },
  { value: "en", labelKey: "english" },
];

interface FaqFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  faqId?: string;
}

export function FaqFormDialog({ open, onOpenChange, faqId }: FaqFormDialogProps) {
  const { t } = useTranslation("content");
  const isEdit = Boolean(faqId);

  const { data: existing } = useFaq(open ? faqId : undefined);
  const createFaq = useCreateFaq();
  const updateFaq = useUpdateFaq();
  const isPending = createFaq.isPending || updateFaq.isPending;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FaqFormValues>({
    resolver: zodResolver(faqFormSchema),
    defaultValues: { question: "", answer: "", group: "", locale: "id", sortOrder: 0, isActive: true },
    values: existing
      ? {
          question: existing.question,
          answer: existing.answer,
          group: existing.group ?? "",
          locale: existing.locale,
          sortOrder: existing.sort_order,
          isActive: existing.is_active,
        }
      : undefined,
  });

  const onSubmit = (values: FaqFormValues) => {
    const payload = {
      question: values.question,
      answer: values.answer,
      group: values.group || undefined,
      locale: values.locale,
      sort_order: values.sortOrder,
      is_active: values.isActive,
    };
    const onSuccess = () => onOpenChange(false);

    if (faqId) {
      updateFaq.mutate({ id: faqId, input: payload }, { onSuccess });
      return;
    }
    createFaq.mutate(payload, { onSuccess });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit FAQ" : "Add FAQ"}</DialogTitle>
          <DialogDescription>{t("faqSubtitle")}</DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="faq-question"
              required
            >{t("colQuestion")}</FieldLabel>
            <Input
              id="faq-question"
              className="rounded-xl"
              aria-required="true"
              placeholder={t("questionPlaceholder")}
              {...register("question")}
            />
            {errors.question && (
              <Text
                variant="small"
                className="text-destructive"
              >
                {errors.question.message}
              </Text>
            )}
          </Box>

          <Box className="flex flex-col gap-1.5">
            <FieldLabel
              htmlFor="faq-answer"
              required
            >{t("answer")}</FieldLabel>
            <Textarea
              id="faq-answer"
              rows={5}
              className="rounded-xl"
              aria-required="true"
              {...register("answer")}
            />
            {errors.answer && (
              <Text
                variant="small"
                className="text-destructive"
              >
                {errors.answer.message}
              </Text>
            )}
          </Box>

          <Box className="grid gap-4 sm:grid-cols-3">
            <Controller
              control={control}
              name="locale"
              render={({ field }) => (
                <SelectField
                  id="faq-locale"
                  label={t("language")}
                  options={translateOptions(LOCALE_OPTIONS, t)}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.locale?.message}
                  required
                />
              )}
            />
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="faq-group"
                optional
              >{t("group")}</FieldLabel>
              <Input
                id="faq-group"
                className="rounded-xl"
                placeholder={t("groupPlaceholder")}
                {...register("group")}
              />
            </Box>
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="faq-sort"
                required
              >{t("order")}</FieldLabel>
              <Input
                id="faq-sort"
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
          </Box>

          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Box className="flex items-center gap-3">
                <Switch
                  id="faq-active"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="faq-active">{t("active")}</Label>
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
