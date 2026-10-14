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
import { Heading } from "@/components/common/Heading";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ContentSectionsBuilder } from "./ContentSectionsBuilder";
import { useArticle, useCreateArticle, useUpdateArticle } from "../hooks/useArticles";
import { useArticleCategoryOptions } from "../hooks/useArticleCategories";
import { formToSections, sectionsToForm } from "../lib/sections";
import { articleFormSchema, type ArticleFormValues } from "../schemas/contentForms.schema";
import type { ArticleType } from "../types/content.type";

const LOCALE_OPTIONS = [
  { value: "id", labelKey: "indonesian" },
  { value: "en", labelKey: "english" },
];

interface ArticleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ArticleType;
  /** Present = edit mode; absent = add mode. */
  articleId?: string;
}

/** Add / Edit for both articles and news — one form, the type fixed by prop. */
export function ArticleFormDialog({ open, onOpenChange, type, articleId }: ArticleFormDialogProps) {
  const { t } = useTranslation("content");
  const isEdit = Boolean(articleId);

  const { data: existing } = useArticle(open ? articleId : undefined);
  const { options: categoryOptions, isLoading: categoriesLoading } = useArticleCategoryOptions();
  const createArticle = useCreateArticle();
  const updateArticle = useUpdateArticle();
  const isPending = createArticle.isPending || updateArticle.isPending;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ArticleFormValues>({
    resolver: zodResolver(articleFormSchema),
    defaultValues: {
      title: "",
      articleCategoryId: "",
      categoryLabel: "",
      type,
      locale: "id",
      slug: "",
      excerpt: "",
      authorName: "Admin_Topupgame",
      sections: [{ heading: "", body: "" }],
      isPublished: true,
      isFeatured: false,
      metaTitle: "",
      metaDescription: "",
      metaRobots: "index,follow",
    },
    // `values` rather than `defaultValues` so the form re-syncs once the
    // record resolves — on edit it is undefined for the first render.
    values: existing
      ? {
          title: existing.title,
          articleCategoryId: existing.article_category_id,
          categoryLabel: existing.category_label ?? "",
          type: existing.type,
          locale: existing.locale,
          slug: existing.slug,
          excerpt: existing.excerpt ?? "",
          authorName: existing.author_name,
          sections: existing.body_sections.length ? sectionsToForm(existing.body_sections) : [{ heading: "", body: "" }],
          isPublished: existing.is_published,
          isFeatured: existing.is_featured,
          metaTitle: existing.meta_title ?? "",
          metaDescription: existing.meta_description ?? "",
          metaRobots: existing.meta_robots ?? "",
        }
      : undefined,
  });

  const onSubmit = (values: ArticleFormValues) => {
    const payload = {
      title: values.title,
      article_category_id: values.articleCategoryId,
      category_label: values.categoryLabel || undefined,
      type: values.type,
      locale: values.locale,
      // Left blank means "derive it from the title" — the API generates a
      // unique slug rather than us guessing one here.
      slug: values.slug || undefined,
      excerpt: values.excerpt,
      author_name: values.authorName,
      body_sections: formToSections(values.sections),
      is_published: values.isPublished,
      is_featured: values.isFeatured,
      meta_title: values.metaTitle,
      meta_description: values.metaDescription,
      meta_robots: values.metaRobots,
    };

    const onSuccess = () => onOpenChange(false);

    if (articleId) {
      updateArticle.mutate({ id: articleId, input: payload }, { onSuccess });
      return;
    }
    createArticle.mutate(payload as never, { onSuccess });
  };

  const entityLabel = type === "news" ? "News" : "Article";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${entityLabel}` : `Add ${entityLabel}`}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the content, publication state and SEO for this entry."
              : "Write a new entry for the storefront. Sections become the body the reader sees."}
          </DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          <Box className="flex flex-col gap-4">
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="article-title"
                required
              >{t("title")}</FieldLabel>
              <Input
                id="article-title"
                className="rounded-xl"
                aria-required="true"
                placeholder={t("articleTitlePlaceholder")}
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

            <Box className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="articleCategoryId"
                render={({ field }) => (
                  <SelectField
                    id="article-category"
                    label={t("category")}
                    options={categoryOptions}
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.articleCategoryId?.message}
                    disabled={categoriesLoading}
                    required
                  />
                )}
              />

              <Controller
                control={control}
                name="locale"
                render={({ field }) => (
                  <SelectField
                    id="article-locale"
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

            <Box className="grid gap-4 sm:grid-cols-2">
              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="article-category-label"
                  optional
                >{t("badgeLabel")}</FieldLabel>
                <Input
                  id="article-category-label"
                  className="rounded-xl"
                  placeholder={t("badgeLabelPlaceholder")}
                  {...register("categoryLabel")}
                />
                <Text variant="muted">{t("badgeLabelHint")}</Text>
              </Box>

              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="article-slug"
                  optional
                >{t("slug")}</FieldLabel>
                <Input
                  id="article-slug"
                  className="rounded-xl"
                  placeholder={t("slugPlaceholder")}
                  {...register("slug")}
                />
              </Box>
            </Box>

            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="article-author"
                required
              >{t("colAuthor")}</FieldLabel>
              <Input
                id="article-author"
                placeholder={t("authorNamePlaceholder")}
                className="rounded-xl"
                aria-required="true"
                {...register("authorName")}
              />
              {errors.authorName && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.authorName.message}
                </Text>
              )}
            </Box>

            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="article-excerpt"
                optional
              >{t("excerpt")}</FieldLabel>
              <Textarea
                id="article-excerpt"
                rows={3}
                className="rounded-xl"
                placeholder={t("excerptPlaceholder")}
                {...register("excerpt")}
              />
              {errors.excerpt && (
                <Text
                  variant="small"
                  className="text-destructive"
                >
                  {errors.excerpt.message}
                </Text>
              )}
            </Box>
          </Box>

          <Box>
            <ContentSectionsBuilder
              control={control as never}
              register={register as never}
              errors={errors}
            />
          </Box>

          <Box className="flex flex-col gap-4">
            <Heading
              level={2}
              variant="subtitle"
            >{t("publicationSeo")}</Heading>

            <Box className="flex flex-col gap-3 sm:flex-row sm:gap-8">
              <Controller
                control={control}
                name="isPublished"
                render={({ field }) => (
                  <Box className="flex items-center gap-3">
                    <Switch
                      id="article-published"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label htmlFor="article-published">{t("published")}</Label>
                  </Box>
                )}
              />
              <Controller
                control={control}
                name="isFeatured"
                render={({ field }) => (
                  <Box className="flex items-center gap-3">
                    <Switch
                      id="article-featured"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label htmlFor="article-featured">{t("featured")}</Label>
                  </Box>
                )}
              />
            </Box>

            <Box className="grid gap-4 sm:grid-cols-2">
              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="article-meta-title"
                  optional
                >{t("metaTitle")}</FieldLabel>
                <Input
                  id="article-meta-title"
                  placeholder={t("metaTitlePlaceholder")}
                  className="rounded-xl"
                  {...register("metaTitle")}
                />
              </Box>
              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="article-meta-robots"
                  optional
                >{t("metaRobots")}</FieldLabel>
                <Input
                  id="article-meta-robots"
                  className="rounded-xl"
                  placeholder={t("metaRobotsPlaceholder")}
                  {...register("metaRobots")}
                />
              </Box>
            </Box>

            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="article-meta-description"
                optional
              >{t("metaDescription")}</FieldLabel>
              <Textarea
                id="article-meta-description"
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
