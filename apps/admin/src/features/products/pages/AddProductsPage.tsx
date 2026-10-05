import { useTranslation } from "react-i18next";
import { Fragment, useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Minus, Plus, Search, SlidersHorizontal } from "lucide-react";

import { Box } from "@/components/common/Box";
import { FieldLabel, InfoTooltip } from "@/components/common/FieldLabel";
import { Heading } from "@/components/common/Heading";
import { SelectField } from "@/components/common/SelectField";
import { Text } from "@/components/common/Text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/utils/currency";
import { computeRolePrice } from "../lib/computeRolePrice";
import { usePoolCandidates, usePoolFacets } from "../hooks/useProviderPool";
import { useMarginPlanOptions, usePricingRuleOptions } from "../hooks/useProviderProducts";
import { useAddProductsFromSupplier, useProductList } from "../hooks/useProducts";
import { useProductSelectOptions } from "../hooks/useProductSelectOptions";
import type { PricingRuleOption } from "../services/provider.service";

export type AddMode = "single" | "bulk";

interface AddProductsPageProps {
  /** Single adds one product; bulk takes many. Switchable on the page. */
  mode?: AddMode;
}

const PER_PAGE = 10;
const NONE = "all";
const rupiah = (value: number) => formatCurrency(value, { fractionDigits: 0 });

/** One row's editable data. Strings, because they are inputs. */
interface RowForm {
  name: string;
  subName: string;
  subCategoryId: string;
  points: string;
  pointsFlat: string;
  discountType: "" | "percent" | "fixed";
  discountValue: string;
  priceMin: string;
  priceMax: string;
  margins: Record<string, string>;
  mix: { productId: string; quantity: string }[];
}

const emptyForm = (name: string): RowForm => ({
  name,
  subName: "",
  subCategoryId: "",
  points: "",
  pointsFlat: "",
  discountType: "",
  discountValue: "",
  priceMin: "",
  priceMax: "",
  margins: {},
  mix: [],
});

const toNumber = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Add Products — a full PAGE holding one TABLE that creates and configures
 * together. It was a modal; it is a page now so the grid has the whole width and
 * every field can carry a visible title and an info tooltip.
 *
 * The rows are the filtered provider price list, not a stack of forms: picking a
 * service makes its row editable in place, so fifty of them stay one screen and
 * two rows can be compared at a glance. `Modal` (the supplier's cost) stays
 * visible beside the sell prices the admin's margins produce, which is the whole
 * reason a bulk screen is worth having.
 *
 * Prices are authored as a MARGIN per membership plan. Leaving a margin empty
 * means "follow the pricing rules" — the same contract the API writes — so the
 * price shown is the rule's (`ceil(cost × (1 + %/100)) + flat`); typing a percent
 * overrides the rule for that plan. What is displayed is a preview of what the
 * server will compute.
 */
export default function AddProductsPage({ mode = "single" }: AddProductsPageProps) {
  const { t } = useTranslation("products");
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Real route and unauthenticated preview twin share this page; the list lives
  // one segment up under whichever base we were reached through.
  const base = pathname.startsWith("/admin/products-preview") ? "/admin/products-preview" : "/admin/products";
  const backToList = () => navigate({ to: `${base}/main` as "/admin/products/main" });

  const [currentMode, setCurrentMode] = useState<AddMode>(mode);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [providerCategory, setProviderCategory] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [forms, setForms] = useState<Record<string, RowForm>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: facets } = usePoolFacets();

  const params = useMemo(
    () => ({
      search: search || undefined,
      page,
      per_page: PER_PAGE,
      // "all", not "not_pooled": a service that is already ours must stay
      // VISIBLE and un-tickable, or the admin cannot tell "not added yet" from
      // "already added".
      pool_state: "all",
      availability: "all",
      provider_category: providerCategory || undefined,
      category_id: categoryId || undefined,
    }),
    [search, page, providerCategory, categoryId],
  );

  const { data, isLoading } = usePoolCandidates(params);
  const { data: plans = [] } = useMarginPlanOptions();
  const { data: pricingRules = [] } = usePricingRuleOptions();
  // Sub-categories belong to a category. With the list filtered to one, every
  // row shares the same options — which is why the filter is the honest place
  // to read them from rather than guessing per row.
  const { subCategoryOptions } = useProductSelectOptions(categoryId || undefined);
  const { data: catalogue } = useProductList({ per_page: 100 });
  const addProducts = useAddProductsFromSupplier();

  const rows = data?.data ?? [];
  const lastPage = data?.meta.last_page ?? 1;

  const providerOptions = useMemo(
    () => [
      { value: NONE, label: t("allProviders") },
      ...(facets?.provider_categories ?? []).map((entry) => ({
        value: entry.provider_category,
        label: `${entry.provider_category} (${entry.count})`,
      })),
    ],
    [facets, t],
  );

  const categoryOptions = useMemo(
    () => [
      { value: NONE, label: t("allCategories") },
      ...(facets?.categories ?? []).map((entry) => ({
        value: String(entry.id),
        label: `${entry.name ?? "—"} (${entry.count})`,
      })),
    ],
    [facets, t],
  );

  const componentOptions = useMemo(
    () =>
      (catalogue?.data ?? []).map((product) => ({
        value: product.id,
        label: `${product.name} — ${product.code}`,
      })),
    [catalogue],
  );

  // Two plans can share a display name (the free and paid tiers are both
  // "Basic"), so a name is disambiguated by its code only when it repeats.
  const duplicateLabels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const plan of plans) counts.set(plan.label, (counts.get(plan.label) ?? 0) + 1);
    return counts;
  }, [plans]);

  const planLabel = (plan: (typeof plans)[number]) =>
    (duplicateLabels.get(plan.label) ?? 0) > 1 ? `${plan.label} (${plan.code})` : plan.label;

  /**
   * The pricing rule a plan falls back to when its margin is left empty. The
   * category is only known when the list is filtered to one, so a category rule
   * is honoured then; plan-specific rules always beat the catch-all fallback.
   */
  const ruleForPlan = useCallback(
    (planValue: string): PricingRuleOption | undefined => {
      const planId = Number(planValue);
      const catId = categoryId ? Number(categoryId) : null;
      const find = (cat: number | null, plan: number | null) =>
        pricingRules.find((rule) => rule.category_id === cat && rule.membership_plan_id === plan);

      return (
        (catId !== null ? find(catId, planId) : undefined) ??
        find(null, planId) ??
        (catId !== null ? find(catId, null) : undefined) ??
        find(null, null)
      );
    },
    [pricingRules, categoryId],
  );

  const selectMode = (value: AddMode) => {
    setCurrentMode(value);
    if (value === "single") {
      // Single keeps ONE row: the admin means "this one, not that one".
      setSelected((current) => current.slice(0, 1));
      return;
    }
    // Mix is a Single-only decision; a Bulk selection must not carry any, or a
    // staged composition would follow a mode the admin cannot edit it in.
    setForms((current) => {
      let changed = false;
      const next: Record<string, RowForm> = {};
      for (const [key, form] of Object.entries(current)) {
        if (form.mix.length > 0) {
          changed = true;
          next[key] = { ...form, mix: [] };
        } else {
          next[key] = form;
        }
      }
      return changed ? next : current;
    });
  };

  const toggle = (row: { buyer_sku_code: string; name: string }, disabled: boolean) => {
    if (disabled) return;

    const code = row.buyer_sku_code;

    setSelected((current) => {
      if (current.includes(code)) return current.filter((entry) => entry !== code);

      setForms((existing) => (existing[code] ? existing : { ...existing, [code]: emptyForm(row.name) }));

      return currentMode === "single" ? [code] : [...current, code];
    });
  };

  const patch = (code: string, changes: Partial<RowForm>) =>
    setForms((current) => ({ ...current, [code]: { ...current[code], ...changes } }));

  const submit = (publish: boolean) =>
    addProducts.mutate(
      {
        publish,
        items: selected.map((code) => {
          const form = forms[code] ?? emptyForm(code);
          const margins: Record<string, number | null> = {};

          for (const plan of plans) {
            margins[plan.value] = toNumber(form.margins[plan.value] ?? "");
          }

          return {
            buyer_sku_code: code,
            name: form.name || undefined,
            sub_name: form.subName || undefined,
            sub_category_id: form.subCategoryId || undefined,
            discount_type: form.discountType || undefined,
            discount_value: toNumber(form.discountValue) ?? undefined,
            point_percent: toNumber(form.points) ?? undefined,
            point_flat: toNumber(form.pointsFlat) ?? undefined,
            price_min: toNumber(form.priceMin) ?? undefined,
            price_max: toNumber(form.priceMax) ?? undefined,
            margins,
            // Mix is Single-only: never let a Bulk row carry components, even
            // one staged before the mode switched.
            mix_items:
              currentMode === "single"
                ? form.mix
                    .filter((line) => line.productId !== "")
                    .map((line) => ({ product_id: line.productId, quantity: line.quantity || "1" }))
                : undefined,
          };
        }),
      },
      {
        onSuccess: () => {
          setSelected([]);
          setForms({});
          backToList();
        },
      },
    );

  return (
    <Box className="flex flex-col gap-6">
      {/* The page header is hidden on purpose — the breadcrumb already names the
          screen, and the table wants the vertical space. Kept for a11y/tests. */}
      <Heading
        level={1}
        variant="section"
        className="sr-only"
      >
        {t("addProductsTitle")}
      </Heading>

      <Box className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6">
        {/* Filters and mode, in one strip — the two things that decide which
            rows are on screen and how many may be ticked. */}
        <Box className="flex flex-wrap items-end gap-3">
          <Box className="w-56">
            <SelectField
              id="add-provider-filter"
              label={t("supplier")}
              tooltip={t("tipSupplier")}
              options={providerOptions}
              value={providerCategory || NONE}
              onChange={(next) => {
                setProviderCategory(next === NONE ? "" : next);
                setPage(1);
              }}
            />
          </Box>
          <Box className="w-56">
            <SelectField
              id="add-category-filter"
              label={t("category")}
              tooltip={t("tipOurCategory")}
              options={categoryOptions}
              value={categoryId || NONE}
              onChange={(next) => {
                setCategoryId(next === NONE ? "" : next);
                setPage(1);
              }}
            />
          </Box>
          <Box className="min-w-64 flex-1">
            <Box className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="add-service-search"
                tooltip={t("tipSearchService")}
              >
                {t("search")}
              </FieldLabel>
              <Box className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="add-service-search"
                  className="rounded-xl pl-8"
                  placeholder={t("searchServiceOrSku")}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </Box>
            </Box>
          </Box>
          <Box className="flex flex-col gap-1.5">
            <Box className="flex items-center gap-1.5">
              <Text
                as="span"
                variant="small"
                className="font-medium"
              >
                {t("mode")}
              </Text>
              <InfoTooltip content={t("tipMode")} />
            </Box>
            <Box className="flex items-center gap-2">
              {(["single", "bulk"] as AddMode[]).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={currentMode === value ? "default" : "outline"}
                  className="rounded-xl"
                  onClick={() => selectMode(value)}
                >
                  {t(value === "single" ? "single" : "bulk")}
                </Button>
              ))}
            </Box>
          </Box>
        </Box>

        <Box className="overflow-x-auto rounded-xl border border-border">
          {isLoading && (
            <Text
              variant="muted"
              className="p-4"
            >
              {t("loading")}
            </Text>
          )}

          {!isLoading && rows.length === 0 && (
            <Text
              variant="muted"
              className="p-4"
            >
              {t("poolEmpty")}
            </Text>
          )}

          {!isLoading && rows.length > 0 && (
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-muted/40">
                  <th className="w-10 px-3 py-2" />
                  <th className="min-w-44 px-3 py-2 font-medium">
                    <Box className="flex items-center gap-1.5">
                      {t("colCodeSubCategory")}
                      <InfoTooltip content={t("tipColCodeSubCategory")} />
                    </Box>
                  </th>
                  <th className="min-w-72 px-3 py-2 font-medium">
                    <Box className="flex items-center gap-1.5">
                      {t("colPointsDiscount")}
                      <InfoTooltip content={t("tipColPointsDiscount")} />
                    </Box>
                  </th>
                  <th className="min-w-64 px-3 py-2 font-medium">
                    <Box className="flex items-center gap-1.5">
                      {t("productName")}
                      <InfoTooltip content={t("tipProductName")} />
                    </Box>
                  </th>
                  <th className="min-w-72 px-3 py-2 font-medium">
                    <Box className="flex items-center gap-1.5">
                      {t("price")}
                      <InfoTooltip content={t("tipPriceColumn")} />
                    </Box>
                  </th>
                  <th className="w-28 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const alreadyAdded = row.already_promoted || row.already_pooled;
                  const isSelected = selected.includes(row.buyer_sku_code);
                  const code = row.buyer_sku_code;
                  const form = forms[code] ?? emptyForm(row.name);
                  // Without a category filter the sub-category list is unknown,
                  // so the control says so instead of offering the wrong set.
                  const subCategoryDisabled = !categoryId;

                  return (
                    <Fragment key={row.id}>
                      <tr className={alreadyAdded ? "opacity-50" : ""}>
                        <td className="px-3 py-3 align-top">
                          <Checkbox
                            checked={isSelected}
                            disabled={alreadyAdded}
                            aria-label={`Select ${code}`}
                            onCheckedChange={() => toggle(row, alreadyAdded)}
                          />
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Box className="flex flex-col gap-3">
                            <Box className="flex flex-col gap-1.5">
                              <Box className="flex items-center gap-1.5">
                                <Text
                                  as="span"
                                  variant="small"
                                  className="font-medium"
                                >
                                  {t("code")}
                                </Text>
                                <InfoTooltip content={t("tipProductCode")} />
                              </Box>
                              <Text className="font-medium">{code}</Text>
                            </Box>
                            <SelectField
                              id={`${code}-sub-category`}
                              label={t("subCategory")}
                              tooltip={t("tipSubCategory")}
                              options={subCategoryOptions}
                              value={form.subCategoryId}
                              disabled={!isSelected || subCategoryDisabled}
                              emptyLabel={subCategoryDisabled ? t("chooseCategoryFirst") : t("noSubCategory")}
                              onChange={(value) => patch(code, { subCategoryId: value })}
                            />
                          </Box>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Box className="grid grid-cols-2 gap-3">
                            <Box className="flex flex-col gap-1.5">
                              <FieldLabel
                                htmlFor={`${code}-points`}
                                tooltip={t("tipPoints")}
                              >
                                {t("pointsPercent")}
                              </FieldLabel>
                              <Input
                                id={`${code}-points`}
                                className="rounded-xl tabular-nums"
                                inputMode="numeric"
                                aria-label={`${code} points`}
                                disabled={!isSelected}
                                value={form.points}
                                onChange={(event) => patch(code, { points: event.target.value })}
                              />
                            </Box>
                            <Box className="flex flex-col gap-1.5">
                              <FieldLabel
                                htmlFor={`${code}-bonus`}
                                tooltip={t("tipBonusPoints")}
                              >
                                {t("bonusPoints")}
                              </FieldLabel>
                              <Input
                                id={`${code}-bonus`}
                                className="rounded-xl tabular-nums"
                                inputMode="numeric"
                                aria-label={`${code} bonus`}
                                disabled={!isSelected}
                                value={form.pointsFlat}
                                onChange={(event) => patch(code, { pointsFlat: event.target.value })}
                              />
                            </Box>
                            <SelectField
                              id={`${code}-discount-type`}
                              label={t("discount")}
                              tooltip={t("discountHint")}
                              options={[
                                { value: NONE, label: t("noDiscount") },
                                { value: "percent", label: t("discountPercentOption") },
                                { value: "fixed", label: t("discountFixedOption") },
                              ]}
                              value={form.discountType || NONE}
                              disabled={!isSelected}
                              onChange={(next) =>
                                patch(code, {
                                  discountType: (next === NONE ? "" : next) as RowForm["discountType"],
                                })
                              }
                            />
                            <Box className="flex flex-col gap-1.5">
                              <FieldLabel
                                htmlFor={`${code}-discount-value`}
                                tooltip={t("tipDiscountValue")}
                              >
                                {t("discountValue")}
                              </FieldLabel>
                              <Input
                                id={`${code}-discount-value`}
                                className="rounded-xl tabular-nums"
                                inputMode="numeric"
                                aria-label={`${code} discount`}
                                disabled={!isSelected || !form.discountType}
                                value={form.discountValue}
                                onChange={(event) => patch(code, { discountValue: event.target.value })}
                              />
                            </Box>
                          </Box>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Box className="flex flex-col gap-3">
                            <Box className="flex flex-col gap-1.5">
                              <FieldLabel
                                htmlFor={`${code}-name`}
                                tooltip={t("tipProductName")}
                              >
                                {t("productName")}
                              </FieldLabel>
                              <Input
                                id={`${code}-name`}
                                className="rounded-xl"
                                aria-label={`${code} name`}
                                disabled={!isSelected}
                                value={form.name}
                                onChange={(event) => patch(code, { name: event.target.value })}
                              />
                            </Box>
                            <Box className="flex flex-col gap-1.5">
                              <FieldLabel
                                htmlFor={`${code}-sub-name`}
                                tooltip={t("tipSubName")}
                              >
                                {t("subName")}
                              </FieldLabel>
                              <Input
                                id={`${code}-sub-name`}
                                className="rounded-xl"
                                placeholder={t("subName")}
                                aria-label={`${code} sub name`}
                                disabled={!isSelected}
                                value={form.subName}
                                onChange={(event) => patch(code, { subName: event.target.value })}
                              />
                            </Box>
                          </Box>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Box className="flex flex-col gap-3">
                            <Box className="flex items-center justify-between gap-2 border-b border-border pb-2">
                              <Box className="flex items-center gap-1.5">
                                <Text
                                  as="span"
                                  variant="small"
                                  className="font-medium"
                                >
                                  {t("cost")}
                                </Text>
                                <InfoTooltip content={t("tipCost")} />
                              </Box>
                              <Text
                                as="span"
                                variant="small"
                                className="tabular-nums text-muted-foreground"
                              >
                                {rupiah(row.cost)}
                              </Text>
                            </Box>

                            <Box className="flex flex-col gap-2">
                              {plans.map((plan) => {
                                const rule = ruleForPlan(plan.value);
                                const margin = toNumber(form.margins[plan.value] ?? "");
                                const auto = margin === null;
                                // Empty margin = follow the rule; typed = the
                                // admin's own percent (no flat, matching the API).
                                const price = auto
                                  ? rule
                                    ? computeRolePrice(row.cost, rule.markup_percent, rule.markup_flat)
                                    : row.cost
                                  : computeRolePrice(row.cost, margin, 0);

                                return (
                                  <Box
                                    key={plan.value}
                                    className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto] items-center gap-x-2 gap-y-1"
                                  >
                                    <Box className="flex min-w-0 items-center gap-1.5">
                                      <Text
                                        as="span"
                                        variant="small"
                                        className="truncate"
                                      >
                                        {planLabel(plan)} (%)
                                      </Text>
                                      <InfoTooltip content={t("tipMargin")} />
                                    </Box>
                                    <Input
                                      id={`${code}-margin-${plan.value}`}
                                      className="rounded-lg px-2 text-right tabular-nums"
                                      inputMode="decimal"
                                      placeholder={rule ? `${rule.markup_percent}%` : t("pricingRules")}
                                      aria-label={`${code} ${plan.label} margin`}
                                      disabled={!isSelected}
                                      value={form.margins[plan.value] ?? ""}
                                      onChange={(event) =>
                                        patch(code, {
                                          margins: { ...form.margins, [plan.value]: event.target.value },
                                        })
                                      }
                                    />
                                    <Badge
                                      variant={auto ? "outline" : "secondary"}
                                      className="justify-self-end tabular-nums"
                                      title={auto ? t("priceFollowsRules") : undefined}
                                    >
                                      {rupiah(price)}
                                    </Badge>
                                  </Box>
                                );
                              })}
                            </Box>
                          </Box>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-xl"
                            disabled={!isSelected}
                            onClick={() => setExpanded(expanded === code ? null : code)}
                          >
                            <SlidersHorizontal className="size-4" />
                            {t("detail")}
                            {form.mix.length > 0 ? ` (${form.mix.length})` : ""}
                          </Button>
                        </td>
                      </tr>

                      {/* Detail: the fields that are per-product by nature. Mix
                          cannot be filled for many rows at once, which is
                          exactly why it lives here and not in the grid. */}
                      {expanded === code && (
                        <tr>
                          <td
                            colSpan={6}
                            className="border-t border-border bg-muted/20 px-3 py-3"
                          >
                            <Box className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <Box className="flex flex-col gap-1.5">
                                <FieldLabel
                                  htmlFor={`${code}-price-min`}
                                  tooltip={t("tipLowerLimit")}
                                >
                                  {t("lowerLimit")}
                                </FieldLabel>
                                <Input
                                  id={`${code}-price-min`}
                                  className="rounded-xl tabular-nums"
                                  inputMode="numeric"
                                  aria-label={`${code} price min`}
                                  value={form.priceMin}
                                  onChange={(event) => patch(code, { priceMin: event.target.value })}
                                />
                              </Box>
                              <Box className="flex flex-col gap-1.5">
                                <FieldLabel
                                  htmlFor={`${code}-price-max`}
                                  tooltip={t("tipUpperLimit")}
                                >
                                  {t("upperLimit")}
                                </FieldLabel>
                                <Input
                                  id={`${code}-price-max`}
                                  className="rounded-xl tabular-nums"
                                  inputMode="numeric"
                                  aria-label={`${code} price max`}
                                  value={form.priceMax}
                                  onChange={(event) => patch(code, { priceMax: event.target.value })}
                                />
                              </Box>
                            </Box>

                            <Box className="mt-4 flex flex-col gap-2">
                              <Box className="flex items-center justify-between">
                                <Box className="flex items-center gap-1.5">
                                  <Text className="font-medium">{t("tabProductMix")}</Text>
                                  <InfoTooltip content={currentMode === "single" ? t("tipMix") : t("mixSingleOnly")} />
                                </Box>
                                {currentMode === "single" && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={() => patch(code, { mix: [...form.mix, { productId: "", quantity: "1" }] })}
                                  >
                                    <Plus className="size-4" />{t("addMix")}
                                  </Button>
                                )}
                              </Box>

                              {currentMode === "bulk" ? (
                                <Text variant="muted">{t("mixSingleOnly")}</Text>
                              ) : form.mix.length === 0 ? (
                                <Text variant="muted">{t("noProductMix")}</Text>
                              ) : (
                                <Box className="flex flex-col gap-3">
                                  {form.mix.map((line, index) => (
                                    <Box
                                      key={index}
                                      className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-end gap-3"
                                    >
                                      <SelectField
                                        id={`${code}-mix-${index}`}
                                        label={t("mainProduct")}
                                        tooltip={t("tipMixProduct")}
                                        options={componentOptions}
                                        value={line.productId}
                                        onChange={(value) =>
                                          patch(code, {
                                            mix: form.mix.map((entry, i) =>
                                              i === index ? { ...entry, productId: value } : entry,
                                            ),
                                          })
                                        }
                                      />
                                      <Box className="flex flex-col gap-1.5">
                                        <FieldLabel
                                          htmlFor={`${code}-mix-qty-${index}`}
                                          tooltip={t("tipQuantity")}
                                        >
                                          {t("quantity")}
                                        </FieldLabel>
                                        <Input
                                          id={`${code}-mix-qty-${index}`}
                                          className="rounded-xl"
                                          inputMode="numeric"
                                          aria-label={`${code} mix ${index + 1} quantity`}
                                          value={line.quantity}
                                          onChange={(event) =>
                                            patch(code, {
                                              mix: form.mix.map((entry, i) =>
                                                i === index ? { ...entry, quantity: event.target.value } : entry,
                                              ),
                                            })
                                          }
                                        />
                                      </Box>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Remove mix ${index + 1}`}
                                        className="rounded-xl"
                                        onClick={() => patch(code, { mix: form.mix.filter((_, i) => i !== index) })}
                                      >
                                        <Minus className="size-4" />
                                      </Button>
                                    </Box>
                                  ))}
                                </Box>
                              )}
                            </Box>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </Box>

        <Box className="flex items-center justify-between">
          <Text variant="small">{t("pageOf", { page, last: lastPage })}</Text>
          <Box className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-xl"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-xl"
              disabled={page >= lastPage}
              onClick={() => setPage((current) => current + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </Box>
        </Box>

        <Box className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={backToList}
          >
            {t("cancel")}
          </Button>
          {/* Draft first (the safe choice), publish second (the deliberate one). */}
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={selected.length === 0 || addProducts.isPending}
            onClick={() => submit(false)}
          >
            {t("saveDraft")} ({selected.length})
          </Button>
          <Button
            className="rounded-xl"
            disabled={selected.length === 0 || addProducts.isPending}
            onClick={() => submit(true)}
          >
            {t("publishNow")} ({selected.length})
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
