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
import { ContentSectionsBuilder } from "./ContentSectionsBuilder";
import { useCreatePage, usePage, useUpdatePage } from "../hooks/usePages";
import { formToIntro, formToSections, introToForm, sectionsToForm } from "../lib/sections";
import { pageFormSchema, type PageFormValues } from "../schemas/contentForms.schema";

const LOCALE_OPTIONS = [
  { value: "id", labelKey: "indonesian" },
  { value: "en", labelKey: "english" },
];

interface PageFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  pageId?: string;
}

export function PageFormDialog({ open, onOpenChange, pageId }: PageFormDialogProps) {
  const { t } = useTranslation("content");
  const isEdit = Boolean(pageId);

  const { data: existing } = usePage(open ? pageId : undefined);
  const createPage = useCreatePage();
  const updatePage = useUpdatePage();
  const isPending = createPage.isPending || updatePage.isPending;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PageFormValues>({
    resolver: zodResolver(pageFormSchema),
    defaultValues: {
      slug: "",
      locale: "id",
      title: "",
      intro: "",
      sections: [],
      isPublished: true,
      metaTitle: "",
      metaDescription: "",
      metaRobots: "noindex,follow",
    },
    values: existing
      ? {
          slug: existing.slug,
          locale: existing.locale,
          title: existing.title,
          intro: introToForm(existing.intro),
          sections: sectionsToForm(existing.sections),
          isPublished: existing.is_published,
          metaTitle: existing.meta_title ?? "",
          metaDescription: existing.meta_description ?? "",
          metaRobots: existing.meta_robots ?? "",
        }
      : undefined,
  });

  const onSubmit = (values: PageFormValues) => {
    const payload = {
      slug: values.slug,
      locale: values.locale,
      title: values.title,
      intro: formToIntro(values.intro),
      sections: formToSections(values.sections),
      is_published: values.isPublished,
      meta_title: values.metaTitle,
      meta_description: values.metaDescription,
      meta_robots: values.metaRobots,
    };
    const onSuccess = () => onOpenChange(false);

    if (pageId) {
      updatePage.mutate({ id: pageId, input: payload }, { onSuccess });
      return;
    }
    createPage.mutate(payload, { onSuccess });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Page" : "Add Page"}</DialogTitle>
          <DialogDescription>{t("pageSubtitle")}</DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          <Box className="flex flex-col gap-4">
            <Box className="grid gap-4 sm:grid-cols-3">
              <Box className="flex flex-col gap-1.5 sm:col-span-2">
                <FieldLabel
                  htmlFor="page-title"
                  required
                >{t("title")}</FieldLabel>
                <Input
                  id="page-title"
                  className="rounded-xl"
                  aria-required="true"
                  {...register("title")}
                />
                {errors.title && (
                  <Text
                    variant="small"
                    className="text-destructive"
                  >
                    {errors.title.message}
                  </Text>
                )}
              </Box>

              <Controller
                control={control}
                name="locale"
                render={({ field }) => (
                  <SelectField
                    id="page-locale"
                    label={t("language")}
                    options={translateOptions(LOCALE_OPTIONS, t)}
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.locale?.message}
                    required
                  />
                )}
              />
            </Box>

            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="page-slug"
                required
              >{t("slug")}</FieldLabel>
              <Input
                id="page-slug"
                className="rounded-xl"
                aria-required="true"
                placeholder={t("pageSlugPlaceholder")}
                {...register("slug")}
              />
              {errors.slug && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.slug.message}
                </Text>
              )}
            </Box>

            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="page-intro"
                optional
              >{t("intro")}</FieldLabel>
              <Textarea
                id="page-intro"
                rows={4}
                className="rounded-xl"
                placeholder={t("introPlaceholder")}
                {...register("intro")}
              />
            </Box>
          </Box>

          <Box>
            <ContentSectionsBuilder
              control={control as never}
              register={register as never}
              errors={errors}
              requireOne={false}
            />
          </Box>

          <Box className="flex flex-col gap-4">
            <Controller
              control={control}
              name="isPublished"
              render={({ field }) => (
                <Box className="flex items-center gap-3">
                  <Switch
                    id="page-published"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="page-published">{t("published")}</Label>
                </Box>
              )}
            />

            <Box className="grid gap-4 sm:grid-cols-2">
              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="page-meta-title"
                  optional
                >{t("metaTitle")}</FieldLabel>
                <Input
                  id="page-meta-title"
                  className="rounded-xl"
                  {...register("metaTitle")}
                />
              </Box>
              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="page-meta-robots"
                  optional
                >{t("metaRobots")}</FieldLabel>
                <Input
                  id="page-meta-robots"
                  className="rounded-xl"
                  {...register("metaRobots")}
                />
              </Box>
            </Box>

            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="page-meta-description"
                optional
              >{t("metaDescription")}</FieldLabel>
              <Textarea
                id="page-meta-description"
                rows={3}
                className="rounded-xl"
                {...register("metaDescription")}
              />
              {errors.metaDescription && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.metaDescription.message}
                </Text>
              )}
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
