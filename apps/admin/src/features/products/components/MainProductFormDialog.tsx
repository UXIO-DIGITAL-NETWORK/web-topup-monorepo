import { translateOptions } from "@/lib/i18nOptions";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Box } from "@/components/common/Box";
import { Can } from "@/components/common/Can";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Heading } from "@/components/common/Heading";
import { ImageDropzone } from "@/components/common/ImageDropzone";
import { SelectField } from "@/components/common/SelectField";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { decimalOnly, digitsOnly } from "@/lib/numericInput";
import { formatCurrency } from "@/utils/currency";
import { PlanPriceCard } from "./PlanPriceCard";
import { ProductMixBuilder } from "./ProductMixBuilder";
import { NICKNAME_VALIDATION_OPTIONS, PRODUCT_ACCESS_OPTIONS, PRODUCT_TAG_OPTIONS } from "../data/select-options.data";
import { useCreateProduct, useProduct, useSetProductMargin, useSetProductMix, useUpdateProduct } from "../hooks/useProducts";
import { useProductSelectOptions } from "../hooks/useProductSelectOptions";
import { useMarginPlanOptions } from "../hooks/useProviderProducts";
import { numericRegister } from "../lib/numericRegister";
import { DESCRIPTION_MAX, productFormSchema, type ProductFormValues } from "../schemas/productForm.schema";

interface MainProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  productId?: string;
}

type ProductTab = "product" | "pricing" | "mix";

const rupiah = (value: number) => formatCurrency(value, { fractionDigits: 0 });

/** Blank fields mean "not set"; only a real number is sent. */
const toNumber = (raw: string | undefined): number | null => {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Add / Edit Main Product (product_requirements.md §4.6), as a modal — the
 * create/update flow no longer navigates to its own page.
 *
 * Three tabs rather than one long scroll — Product, Pricing & Margin, Product
 * Mix — because they are three separate decisions with three different
 * audiences, and the form was long enough that the pricing fields were below
 * the fold.
 *
 * Pricing is authored as a **margin per membership plan**, which is how the
 * platform actually prices, and saved through `POST /products/{id}/profit-margin`
 * — the endpoint delegates to the provider mapping's action, so a margin typed
 * here survives the scheduled repricer when the supplier's cost moves. The five
 * money fields it replaced (Cost/Public/VIP/Reseller/Agent) were never written
 * by anything and could not describe a plan an admin had just created.
 *
 * Product Mix is still captured but not persisted — the API has no bundle
 * endpoint yet — though it now picks from the real catalogue rather than a
 * bundled list of invented SKUs.
 */
export function MainProductFormDialog({ open, onOpenChange, productId }: MainProductFormDialogProps) {
  const { t } = useTranslation("products");
  const isEdit = Boolean(productId);
  const { data: existing } = useProduct(open ? productId : undefined);
  const { data: plans = [] } = useMarginPlanOptions();
  const [activeTab, setActiveTab] = useState<ProductTab>("product");

  // The supplier's cost, not something typed here: margins are a markup over it
  // and the preview below is meaningless without it.
  const cost = existing?.variants[0]?.cost_price ?? 0;

  /**
   * The markup each plan currently sells at, derived from its stored price.
   * Effective rather than authored on purpose — a product priced by the pricing
   * rules has no margin row of its own, and showing the admin a blank field for
   * a product that is visibly selling at +20% would read as "unpriced".
   */
  const savedMargins = useMemo<Record<string, string>>(() => {
    const values: Record<string, string> = {};

    for (const plan of plans) {
      const priced = existing?.plan_prices?.find((entry) => String(entry.membership_plan_id) === plan.value);
      values[plan.value] = priced && cost > 0 ? String(Math.round(((priced.price - cost) / cost) * 10000) / 100) : "";
    }

    return values;
  }, [plans, existing, cost]);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      nicknameValidation: "",
      subName: "",
      code: "",
      access: "",
      tag: "",
      category: "",
      subCategory: "",
      description: "",
      points: "",
      pointsFlat: "",
      margins: {},
      priceMin: "",
      priceMax: "",
      discountType: "",
      discountValue: "",
      productMix: [],
    },
    values: existing
      ? {
          name: existing.name,
          nicknameValidation: existing.nickname_validation ?? "",
          subName: existing.sub_name ?? "",
          code: existing.code,
          access: existing.access ?? "",
          tag: existing.tag ?? "",
          category: existing.game_id,
          subCategory: "",
          description: existing.description ?? "",
          points: existing.point_percent != null ? String(existing.point_percent) : "",
          pointsFlat: existing.point_flat != null ? String(existing.point_flat) : "",
          margins: savedMargins,
          priceMin: existing.price_min != null ? String(existing.price_min) : "",
          priceMax: existing.price_max != null ? String(existing.price_max) : "",
          discountType: existing.discount_type ?? "",
          discountValue: existing.discount_value != null ? String(existing.discount_value) : "",
          // The composition, so an edit shows what is stored instead of an empty
          // builder that would clear it on save.
          productMix: (existing.mix_items ?? []).map((item) => ({
            mainProduct: String(item.product_id),
            quantity: String(item.quantity),
          })),
        }
      : undefined,
  });

  const category = watch("category");
  const { categoryOptions, subCategoryOptions, categoriesLoading } = useProductSelectOptions(category || undefined);

  const descriptionLength = (watch("description") ?? "").length;
  const descriptionPercent = Math.round((descriptionLength / DESCRIPTION_MAX) * 100);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const setMargin = useSetProductMargin();
  const setMix = useSetProductMix();
  const isPending = createProduct.isPending || updateProduct.isPending || setMargin.isPending;

  // Live preview of what the typed margins sell at, so the admin is not asked
  // to do the arithmetic the API is about to do.
  const watchedMargins = watch("margins");
  const previewPrices = useMemo(
    () =>
      plans.map((plan) => {
        const margin = toNumber((watchedMargins ?? {})[plan.value]);
        return {
          membership_plan_id: Number(plan.value),
          plan_code: plan.code,
          plan_name: plan.label,
          is_default: plan.is_default,
          price: margin === null ? 0 : Math.ceil(cost * (1 + margin / 100)),
        };
      }),
    [plans, watchedMargins, cost],
  );

  const onSubmit = (values: ProductFormValues) => {
    const payload = {
      name: values.name,
      sub_name: values.subName || undefined,
      code: values.code,
      category_id: values.category,
      sub_category_id: values.subCategory || undefined,
      nickname_validation: values.nicknameValidation || undefined,
      access: values.access || undefined,
      tag: values.tag || undefined,
      description: values.description || undefined,
      logo: values.logo ?? undefined,
      // Blank means "use the global points settings", so it travels as null
      // rather than 0 — 0 is the admin saying this product earns nothing.
      point_percent: values.points === "" || values.points === undefined ? null : Number(values.points),
      point_flat: values.pointsFlat === "" || values.pointsFlat === undefined ? null : Number(values.pointsFlat),
      // The discount travels as a pair. A value without a type is meaningless,
      // so clearing the type clears the value too — null, not 0, which the API
      // reads as "no discount".
      discount_type: values.discountType ? values.discountType : null,
      discount_value:
        values.discountType && values.discountValue !== "" && values.discountValue !== undefined
          ? Number(values.discountValue)
          : null,
    };

    // A plan the admin left blank is an explicit "use the pricing rules"; the
    // API keeps a plan it was not sent exactly as it was.
    const margins: Record<number, number | null> = {};
    for (const plan of plans) {
      margins[Number(plan.value)] = toNumber(values.margins?.[plan.value]);
    }

    const pricing = {
      margins,
      price_min: toNumber(values.priceMin),
      price_max: toNumber(values.priceMax),
      // Sent here as well as on the product itself: this endpoint also writes
      // them onto the provider mapping, which is what carries them onto a
      // product promoted later.
      point_percent: payload.point_percent,
      point_flat: payload.point_flat,
    };

    // Pricing is a second call because it is a different resource: the product
    // row, then the plan prices its margins produce. Sequenced rather than
    // fired together so a rejected product write never leaves prices behind.
    //
    // The rejection is swallowed on purpose rather than left to `void`: the
    // hook's onError has already shown the toast, and an unhandled rejection
    // would reach the console in the browser and fail the whole Vitest run as
    // an unhandled error. Failing here also leaves the dialog open, which is
    // what lets the admin retry the prices without retyping the product.
    const priceThenClose = async (id: string) => {
      if (plans.length > 0) {
        try {
          await setMargin.mutateAsync({ id, input: pricing });
        } catch {
          return;
        }
      }

      // The mix travels LAST: saving it rewrites the product's cost and re-derives
      // its prices, so the margins above have to be stored first for the repriced
      // amounts to survive. An empty composition is how a mix is cleared.
      try {
        await setMix.mutateAsync({
          id,
          // The builder names the field `mainProduct`; the API calls it
          // `product_id`. Mapped here rather than in the service so the form
          // keeps the vocabulary the reference screen uses.
          items: (values.productMix ?? []).map((row) => ({
            product_id: row.mainProduct,
            quantity: row.quantity,
          })),
        });
      } catch {
        return;
      }

      onOpenChange(false);
    };

    if (productId) {
      updateProduct.mutate({ id: productId, input: payload }, { onSuccess: () => void priceThenClose(productId) });
      return;
    }

    createProduct.mutate({ ...payload, status: "active", is_available: true, variants: [] } as never, {
      onSuccess: (created) => void priceThenClose(created.id),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Main Product" : "Add Main Products"}</DialogTitle>
          <DialogDescription>{t("formSubtitle")}</DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          {/* forceMount keeps every field registered while its tab is hidden —
              a validation error on another tab must still block Save, and the
              values must still reach the payload. */}
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ProductTab)}
          >
            <TabsList className="w-full">
              <TabsTrigger value="product">{t("product")}</TabsTrigger>
              <TabsTrigger value="pricing">{t("tabPricingMargin")}</TabsTrigger>
              <TabsTrigger value="mix">{t("tabProductMix")}</TabsTrigger>
            </TabsList>

            <TabsContent
              value="product"
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
                  <Box className="flex flex-col gap-1.5">
                    <FieldLabel
                      htmlFor="product-name"
                      tooltip={t("tipProductName")}
                    >{t("productName")}</FieldLabel>
                    <Input
                      id="product-name"
                      className="rounded-xl"
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
                    name="nicknameValidation"
                    render={({ field }) => (
                      <SelectField
                        id="product-nickname-validation"
                        label={t("nicknameValidation")}
                        tooltip={t("tipNickname")}
                        options={NICKNAME_VALIDATION_OPTIONS}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </Box>

                <Box className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Box className="flex flex-col gap-1.5">
                    <FieldLabel
                      htmlFor="product-sub-name"
                      tooltip={t("tipSubName")}
                    >{t("subName")}</FieldLabel>
                    <Input
                      id="product-sub-name"
                      className="rounded-xl"
                      {...register("subName")}
                    />
                  </Box>
                  <Box className="flex flex-col gap-1.5">
                    <FieldLabel
                      htmlFor="product-code"
                      tooltip={t("tipProductCode")}
                    >{t("productCode")}</FieldLabel>
                    <Input
                      id="product-code"
                      className="rounded-xl"
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
                  <Controller
                    control={control}
                    name="access"
                    render={({ field }) => (
                      <SelectField
                        id="product-access"
                        label={t("productAccess")}
                        tooltip={t("tipAccess")}
                        options={translateOptions(PRODUCT_ACCESS_OPTIONS, t)}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </Box>

                <Box className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Controller
                    control={control}
                    name="tag"
                    render={({ field }) => (
                      <SelectField
                        id="product-tag"
                        label={t("productTag")}
                        tooltip={t("tipTag")}
                        options={translateOptions(PRODUCT_TAG_OPTIONS, t)}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="category"
                    render={({ field }) => (
                      <SelectField
                        id="product-category"
                        label={t("category")}
                        tooltip={t("tipCategory")}
                        options={categoryOptions}
                        disabled={categoriesLoading}
                        emptyLabel={categoriesLoading ? "Loading categories..." : "No categories available"}
                        value={field.value}
                        onChange={(next) => {
                          field.onChange(next);
                          setValue("subCategory", "");
                        }}
                        error={errors.category?.message}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name="subCategory"
                    render={({ field }) => (
                      <SelectField
                        id="product-sub-category"
                        label={t("subCategory")}
                        tooltip={t("tipSubCategory")}
                        options={subCategoryOptions}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        emptyLabel={t("chooseCategoryFirst")}
                      />
                    )}
                  />
                </Box>
              </Box>

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
                      id="product-logo"
                      label={t("productLogo")}
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      formatsLabel="JPG, JPEG, PNG, WEBP up to 10mb"
                      caption={t("logoCaption")}
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.logo?.message}
                      // Only create/update carry the file: `setMargin` is a
                      // separate request on this same form and uploads nothing.
                      uploading={createProduct.isPending || updateProduct.isPending}
                    />
                  )}
                />

                <Box className="flex flex-col gap-1.5">
                  <Label htmlFor="product-description">{t("description")}</Label>
                  <Textarea
                    id="product-description"
                    className="rounded-xl"
                    maxLength={DESCRIPTION_MAX}
                    {...register("description")}
                  />
                  <Box className="flex justify-between">
                    <Text
                      variant="small"
                      className="tabular-nums"
                    >
                      {descriptionLength}/{DESCRIPTION_MAX} characters
                    </Text>
                    <Text
                      variant="small"
                      className="tabular-nums"
                    >
                      {descriptionPercent}% used
                    </Text>
                  </Box>
                </Box>
              </Box>
            </TabsContent>

            <TabsContent
              value="pricing"
              forceMount
              className="flex flex-col gap-6 data-[state=inactive]:hidden"
            >
              <Box className="flex flex-col gap-4">
                <Box>
                  <Heading
                    as="h2"
                    level={5}
                  >{t("tabPricingMargin")}</Heading>
                  <Text variant="muted">{t("marginHint")}</Text>
                </Box>

                <Box className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                  <Text variant="muted">{t("costPrice")}</Text>
                  <Text
                    as="span"
                    className="font-medium tabular-nums"
                  >
                    {cost > 0 ? rupiah(cost) : "—"}
                  </Text>
                </Box>

                {plans.length === 0 ? (
                  <Text variant="muted">{t("noPlans")}</Text>
                ) : (
                  <Box className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {plans.map((plan) => (
                      <Box
                        key={plan.value}
                        className="flex flex-col gap-1.5"
                      >
                        {/* Two plans may share a display name, so the code
                            disambiguates — as on the provider screen. */}
                        <Label htmlFor={`product-margin-${plan.value}`}>
                          {plan.label} ({plan.code}) margin (%){plan.is_default ? " · default tier" : ""}
                        </Label>
                        <Input
                          id={`product-margin-${plan.value}`}
                          className="rounded-xl tabular-nums"
                          inputMode="decimal"
                          placeholder={t("pricingRules")}
                          {...numericRegister(register, `margins.${plan.value}`, decimalOnly)}
                        />
                        {errors.margins?.[plan.value] && (
                          <Text
                            variant="small"
                            className="text-destructive"
                          >
                            {errors.margins[plan.value]?.message}
                          </Text>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}

                {cost > 0 && plans.length > 0 && (
                  <Box className="flex flex-col gap-1.5">
                    <Text variant="muted">{t("resultingPrice")}</Text>
                    <PlanPriceCard
                      cost={cost}
                      plans={previewPrices}
                    />
                  </Box>
                )}

                <Box className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Box className="flex flex-col gap-1.5">
                    <Label htmlFor="product-price-min">{t("lowerLimit")}</Label>
                    <Input
                      id="product-price-min"
                      className="rounded-xl tabular-nums"
                      inputMode="numeric"
                      placeholder={t("rpZero")}
                      {...numericRegister(register, "priceMin", digitsOnly)}
                    />
                    <Text
                      variant="small"
                      className="text-muted-foreground"
                    >
                      0 = no limit
                    </Text>
                  </Box>
                  <Box className="flex flex-col gap-1.5">
                    <Label htmlFor="product-price-max">{t("upperLimit")}</Label>
                    <Input
                      id="product-price-max"
                      className="rounded-xl tabular-nums"
                      inputMode="numeric"
                      placeholder={t("rpZero")}
                      {...numericRegister(register, "priceMax", digitsOnly)}
                    />
                    <Text
                      variant="small"
                      className="text-muted-foreground"
                    >
                      0 = no limit
                    </Text>
                  </Box>
                </Box>

                {/* The product's own standing discount. Radix reserves the
                    empty string for its placeholder, so "no discount" needs a
                    sentinel value here and is mapped back to "" on change. */}
                <Box className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Controller
                    control={control}
                    name="discountType"
                    render={({ field }) => (
                      <SelectField
                        id="product-discount-type"
                        label={t("discount")}
                        tooltip={t("discountHint")}
                        options={[
                          { value: "none", label: t("noDiscount") },
                          { value: "percent", label: t("discountPercentOption") },
                          { value: "fixed", label: t("discountFixedOption") },
                        ]}
                        value={field.value || "none"}
                        onChange={(next) => field.onChange(next === "none" ? "" : next)}
                      />
                    )}
                  />
                  <Box className="flex flex-col gap-1.5">
                    <Label htmlFor="product-discount-value">
                      {watch("discountType") === "percent" ? t("discountPercentOption") : t("discountFixedOption")}
                    </Label>
                    <Input
                      id="product-discount-value"
                      className="rounded-xl tabular-nums"
                      inputMode="numeric"
                      disabled={!watch("discountType")}
                      placeholder={t("rpZero")}
                      {...numericRegister(register, "discountValue", digitsOnly)}
                    />
                    <Text
                      variant="small"
                      className="text-muted-foreground"
                    >
                      {t("discountHint")}
                    </Text>
                  </Box>
                </Box>

                <Box className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Box className="flex flex-col gap-1.5">
                    <FieldLabel
                      htmlFor="product-points"
                      tooltip={t("tipPoints")}
                    >{t("points")}</FieldLabel>
                    <InputGroup className="rounded-xl">
                      <InputGroupInput
                        id="product-points"
                        inputMode="numeric"
                        placeholder={t("globalDefault")}
                        {...numericRegister(register, "points", digitsOnly)}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>%</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    {errors.points && (
                      <Text
                        variant="small"
                        className="text-destructive"
                      >
                        {errors.points.message}
                      </Text>
                    )}
                  </Box>

                  <Box className="flex flex-col gap-1.5">
                    <FieldLabel
                      htmlFor="product-points-flat"
                      tooltip={t("tipBonusPoints")}
                    >{t("bonusPoints")}</FieldLabel>
                    <InputGroup className="rounded-xl">
                      <InputGroupInput
                        id="product-points-flat"
                        inputMode="numeric"
                        placeholder={t("globalDefault")}
                        {...numericRegister(register, "pointsFlat", digitsOnly)}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>pts</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    {errors.pointsFlat && (
                      <Text
                        variant="small"
                        className="text-destructive"
                      >
                        {errors.pointsFlat.message}
                      </Text>
                    )}
                  </Box>
                </Box>
              </Box>
            </TabsContent>

            <TabsContent
              value="mix"
              forceMount
              className="flex flex-col gap-6 data-[state=inactive]:hidden"
            >
              <Box className="flex flex-col gap-4">
                <Box>
                  <Heading
                    as="h2"
                    level={5}
                  >{t("tabProductMix")}</Heading>
                  <Text variant="muted">{t("mixHint")}</Text>
                </Box>

                <ProductMixBuilder
                  control={control}
                  register={register}
                  errors={errors}
                  currentProductId={productId}
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
            <Can permission="products.create">
              <Button
                type="submit"
                className="rounded-xl"
                disabled={isPending}
              >
                {isPending ? "Saving..." : "Save"}
              </Button>
            </Can>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
