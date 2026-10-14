import { translateOptions } from "@/lib/i18nOptions";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Box } from "@/components/common/Box";
import { FieldLabel, InfoTooltip } from "@/components/common/FieldLabel";
import { Heading } from "@/components/common/Heading";
import { ImageDropzone } from "@/components/common/ImageDropzone";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CategoryFormFieldsBuilder } from "./CategoryFormFieldsBuilder";

import { META_ROBOTS_OPTIONS } from "../data/select-options.data";
import { useCategory, useCreateCategory, useUpdateCategory } from "../hooks/useCategories";
import { useCategoryTypeOptions } from "../hooks/useCategoryTypeOptions";
import { slugify } from "../lib/slugify";
import {
  categoryFormSchema,
  META_DESCRIPTION_MAX,
  type CategoryFormValues,
} from "../schemas/categoryForm.schema";

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  categoryId?: string;
}

/** Fields that live on the first tab — used to jump there when a submit fails. */
const DETAIL_FIELDS = [
  "categoryType",
  "name",
  "code",
  "slug",
  "subName",
  "region",
  "accountNicknameValidation",
  "orderFormFields",
] as const;

/**
 * Add / Edit Category (product_requirements.md §4.5), as a modal. Split into two
 * tabs — "Detail" (identity + the order form) and "Media & SEO" — so each is
 * focused. Both tabs stay mounted (`forceMount`) so form state survives a switch.
 */

export function CategoryFormDialog({ open, onOpenChange, categoryId }: CategoryFormDialogProps) {
  const { t } = useTranslation("categories");
  const isEdit = Boolean(categoryId);
  const { data: existing } = useCategory(open ? categoryId : undefined);
  const [activeTab, setActiveTab] = useState<"detail" | "media">("detail");

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      categoryType: "",
      name: "",
      subName: "",
      accountNicknameValidation: "",
      accountNicknameCheckEnabled: true,
      region: "",
      code: "",
      slug: "",
      orderFormFields: [],
      description: "",
      metaTitle: "",
      metaDescription: "",
      metaKeywords: "",
      metaRobots: "",
    },
    // `values` rather than `defaultValues` so the form re-syncs once the record
    // resolves — on edit it is undefined for the first render.
    values: existing
      ? {
          // The id, not the display name — the select and the write both key on it.
          categoryType: existing.type_id,
          name: existing.name,
          subName: existing.sub_name ?? "",
          accountNicknameValidation: existing.account_nickname_validation ?? "",
          accountNicknameCheckEnabled: existing.account_nickname_check_enabled ?? true,
          region: existing.region ?? "",
          code: existing.code,
          slug: existing.slug,
          orderFormFields: existing.order_form_fields.map((field) => ({
            ...field,
            required: field.required ?? false,
          })),
          description: existing.description ?? "",
          metaTitle: existing.meta_title ?? "",
          metaDescription: existing.meta_description ?? "",
          metaKeywords: (existing.meta_keywords ?? []).join(", "),
          metaRobots: existing.meta_robots ?? "",
        }
      : undefined,
  });

  const metaDescriptionLength = (watch("metaDescription") ?? "").length;
  const metaDescriptionPercent = Math.round((metaDescriptionLength / META_DESCRIPTION_MAX) * 100);

  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const isPending = createCategory.isPending || updateCategory.isPending;
  const { options: categoryTypeOptions, isLoading: typesLoading } = useCategoryTypeOptions();

  const handleNameBlur = () => {
    const { name, slug } = getValues();
    if (name && !slug) setValue("slug", slugify(name));
  };

  const onSubmit = (values: CategoryFormValues) => {
    const metaKeywords = (values.metaKeywords ?? "")
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    const payload = {
      // The select carries a real category-type id; `type` remains the
      // display name the list column reads.
      type_id: values.categoryType,
      type: values.categoryType,
      name: values.name,
      sub_name: values.subName || undefined,
      account_nickname_validation: values.accountNicknameValidation || undefined,
      account_nickname_check_enabled: values.accountNicknameCheckEnabled,
      region: values.region || undefined,
      code: values.code,
      slug: values.slug,
      status: "active" as const,
      order_form_fields: values.orderFormFields,
      description: values.description || undefined,
      meta_title: values.metaTitle || undefined,
      meta_description: values.metaDescription || undefined,
      logo: values.logo,
      thumbnail: values.thumbnail,
      banner: values.banner,
      og_image: values.ogImage,
      meta_keywords: metaKeywords.length ? metaKeywords : undefined,
      meta_robots: values.metaRobots || undefined,
    };

    const onSuccess = () => onOpenChange(false);

    if (categoryId) {
      // The service reads the row first to carry `customer_no_template`
      // across — losing it would break supplier fulfilment after payment.
      updateCategory.mutate({ id: categoryId, input: payload }, { onSuccess });
      return;
    }

    createCategory.mutate(payload as never, { onSuccess });
  };

  // A failed validation might sit on the tab that isn't showing; jump to it.
  const onInvalid = (formErrors: typeof errors) => {
    const hasDetailError = DETAIL_FIELDS.some((field) => field in formErrors);
    setActiveTab(hasDetailError ? "detail" : "media");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Category" : "Add Category"}</DialogTitle>
          <DialogDescription>{t("categoryFormSubtitle")}</DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit, onInvalid)}
          className="flex flex-col gap-6"
        >
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "detail" | "media")}
          >
            <TabsList className="w-full">
              <TabsTrigger value="detail">{t("detail")}</TabsTrigger>
              <TabsTrigger value="media">{t("mediaSeo")}</TabsTrigger>
            </TabsList>

            {/* ── Tab 1: Detail ── */}
            <TabsContent
              value="detail"
              forceMount
              className="flex flex-col gap-6 data-[state=inactive]:hidden"
            >
              <Box className="flex flex-col gap-4">
                <Box>
                  <Heading
                    as="h2"
                    level={5}
                  >{t("basicInformation")}</Heading>
                  <Text variant="muted">{t("basicInformationHint")}</Text>
                </Box>

                <Box className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Controller
                    control={control}
                    name="categoryType"
                    render={({ field }) => (
                      <SelectField
                        id="category-type"
                        label={t("colCategoryType")}
                        tooltip={t("tipCategoryType")}
                        options={categoryTypeOptions}
                        disabled={typesLoading}
                        value={field.value}
                        onChange={field.onChange}
                        error={errors.categoryType?.message}
                        required
                      />
                    )}
                  />

                  <Box className="flex flex-col gap-1.5">
                    <FieldLabel
                      htmlFor="category-region"
                      tooltip={t("tipRegion")}
                      optional
                    >{t("region")}</FieldLabel>
                    <Input
                      id="category-region"
                      className="rounded-xl"
                      placeholder={t("regionPlaceholder")}
                      {...register("region")}
                    />
                  </Box>

                  <Box className="flex flex-col gap-1.5">
                    <FieldLabel
                      htmlFor="category-name"
                      tooltip={t("tipCategoryName")}
                      required
                    >{t("colCategoryName")}</FieldLabel>
                    <Input
                      id="category-name"
                      className="rounded-xl"
                      placeholder={t("categoryNamePlaceholder")}
                      aria-required="true"
                      {...register("name", { onBlur: handleNameBlur })}
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
                      htmlFor="category-code"
                      tooltip={t("tipCategoryCode")}
                      required
                    >{t("categoryCode")}</FieldLabel>
                    <Input
                      id="category-code"
                      className="rounded-xl"
                      placeholder={t("categoryCodePlaceholder")}
                      aria-required="true"
                      {...register("code")}
                    />
                    {errors.code && (
                      <Text
                        variant="small"
                        className="text-destructive"
                      >
                        {errors.code.message}
                      </Text>
                    )}
                  </Box>

                  <Box className="flex flex-col gap-1.5">
                    <FieldLabel
                      htmlFor="category-sub-name"
                      tooltip={t("tipSubName")}
                      optional
                    >{t("categorySubName")}</FieldLabel>
                    <Input
                      id="category-sub-name"
                      className="rounded-xl"
                      placeholder={t("categorySubNamePlaceholder")}
                      {...register("subName")}
                    />
                  </Box>

                  <Box className="flex flex-col gap-1.5">
                    <FieldLabel
                      htmlFor="category-slug"
                      tooltip={t("tipSlug")}
                      required
                    >{t("categorySlug")}</FieldLabel>
                    <Input
                      id="category-slug"
                      className="rounded-xl"
                      placeholder={t("categorySlugPlaceholder")}
                      aria-required="true"
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
                </Box>
              </Box>

              <Box className="flex flex-col gap-4">
                <Box>
                  <Box className="flex items-center gap-1.5">
                    <Heading
                      as="h2"
                      level={5}
                    >{t("categoryForm")}</Heading>
                    <InfoTooltip content="The inputs buyers fill in when ordering (e.g. User ID, Server). Field #1 becomes the account id and field #2 the server; these compose the id sent to the supplier." />
                  </Box>
                  <Text variant="muted">{t("categoryFormHint")}</Text>
                </Box>

                <CategoryFormFieldsBuilder
                  control={control}
                  register={register}
                  errors={errors}
                />
              </Box>
            </TabsContent>

            {/* ── Tab 2: Media & SEO ── */}
            <TabsContent
              value="media"
              forceMount
              className="flex flex-col gap-6 data-[state=inactive]:hidden"
            >
              <Box className="flex flex-col gap-4">
                <Box>
                  <Heading
                    as="h2"
                    level={5}
                  >{t("mediaDescription")}</Heading>
                  <Text variant="muted">{t("mediaDescriptionHint")}</Text>
                </Box>

                <Controller
                  control={control}
                  name="logo"
                  render={({ field }) => (
                    <ImageDropzone
                      id="category-logo"
                      existingUrl={existing?.logo_url}
                      label={t("categoryLogo")}
                      caption={t("categoryLogoCaption")}
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.logo?.message}
                      uploading={isPending}
                      optional
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="thumbnail"
                  render={({ field }) => (
                    <ImageDropzone
                      id="category-thumbnail"
                      existingUrl={existing?.thumbnail_url}
                      label={t("cardBackground")}
                      caption={t("cardBackgroundCaption")}
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.thumbnail?.message}
                      uploading={isPending}
                      optional
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="banner"
                  render={({ field }) => (
                    <ImageDropzone
                      id="category-banner"
                      existingUrl={existing?.banner_url}
                      label={t("checkoutBanner")}
                      caption={t("checkoutBannerCaption")}
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.banner?.message}
                      uploading={isPending}
                      optional
                    />
                  )}
                />

                <Box className="flex flex-col gap-1.5">
                  <FieldLabel
                    htmlFor="category-description"
                    tooltip={t("tipDescription")}
                    optional
                  >{t("description")}</FieldLabel>
                  <Textarea
                    id="category-description"
                    className="rounded-xl"
                    {...register("description")}
                  />
                </Box>
              </Box>

              <Box className="flex flex-col gap-4">
                <Box>
                  <Heading
                    as="h2"
                    level={5}
                  >{t("seo")}</Heading>
                  <Text variant="muted">{t("seoHint")}</Text>
                </Box>

                <Box className="flex flex-col gap-1.5">
                  <FieldLabel
                    htmlFor="meta-title"
                    tooltip={t("tipMetaTitle")}
                    optional
                  >{t("metaTitle")}</FieldLabel>
                  <Input
                    id="meta-title"
                    className="rounded-xl"
                    placeholder={t("metaTitlePlaceholder")}
                    {...register("metaTitle")}
                  />
                </Box>

                <Box className="flex flex-col gap-1.5">
                  <FieldLabel
                    htmlFor="meta-description"
                    tooltip={t("tipMetaDescription")}
                    optional
                  >{t("metaDescription")}</FieldLabel>
                  <Textarea
                    id="meta-description"
                    className="rounded-xl"
                    placeholder={t("metaDescriptionPlaceholder")}
                    maxLength={META_DESCRIPTION_MAX}
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
                  <Box className="flex justify-between">
                    <Text variant="small">
                      {metaDescriptionLength}/{META_DESCRIPTION_MAX} characters
                    </Text>
                    <Text variant="small">{metaDescriptionPercent}% used</Text>
                  </Box>
                </Box>

                <Controller
                  control={control}
                  name="ogImage"
                  render={({ field }) => (
                    <ImageDropzone
                      id="og-image"
                      existingUrl={existing?.og_image_url}
                      label={t("ogImage")}
                      caption={t("ogImageCaption")}
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.ogImage?.message}
                      uploading={isPending}
                      optional
                    />
                  )}
                />

                <Box className="flex flex-col gap-1.5">
                  <FieldLabel
                    htmlFor="meta-keyword"
                    tooltip={t("tipMetaKeyword")}
                    optional
                  >{t("metaKeyword")}</FieldLabel>
                  <Input
                    id="meta-keyword"
                    className="rounded-xl"
                    placeholder={t("metaKeywordPlaceholder")}
                    {...register("metaKeywords")}
                  />
                </Box>

                <Controller
                  control={control}
                  name="metaRobots"
                  render={({ field }) => (
                    <SelectField
                      id="meta-robot"
                      label={t("metaRobot")}
                      tooltip={t("tipMetaRobot")}
                      placeholder={t("select")}
                      options={translateOptions(META_ROBOTS_OPTIONS, t)}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      optional
                    />
                  )}
                />
              </Box>
            </TabsContent>
          </Tabs>

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
