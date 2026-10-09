import { useTranslation } from "react-i18next";
import { Fragment, useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Minus, Plus, Search, SlidersHorizontal } from "lucide-react";

import { Box } from "@/components/common/Box";
import { FieldLabel, InfoTooltip } from "@/components/common/FieldLabel";
import { Heading } from "@/components/common/Heading";
import { ImageDropzone } from "@/components/common/ImageDropzone";
import { SelectField } from "@/components/common/SelectField";
import { Text } from "@/components/common/Text";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/currency";
import { usePoolCandidates, usePoolFacets } from "../hooks/useProviderPool";
import { useMarginPlanOptions, usePricingRuleOptions } from "../hooks/useProviderProducts";
import { useAddProductsFromSupplier, useProductList } from "../hooks/useProducts";
import { useProductSelectOptions } from "../hooks/useProductSelectOptions";
import { AddProductsReviewDialog } from "../components/AddProductsReviewDialog";
import { MarginSimulationCard, type MarginSimulationRow } from "../components/MarginSimulationCard";
import { MixProductPicker, type MixProductOption } from "../components/MixProductPicker";
import { buildReviewItem, resolvePlanPrice, type SelectedMeta } from "../lib/reviewProducts";
import type { PoolSort } from "../types/product.type";
import type { PricingRuleOption } from "../services/provider.service";

export type AddMode = "single" | "bulk";

interface AddProductsPageProps {
  /** Single adds one product; bulk takes many. Switchable on the page. */
  mode?: AddMode;
}

const PER_PAGE = 10;
const NONE = "all";
const PAGE_WINDOW = 2;
const rupiah = (value: number) => formatCurrency(value, { fractionDigits: 0 });

/** Small ± window of page numbers around the current page, clamped to [1, lastPage]. */
function pageWindow(page: number, lastPage: number): number[] {
  const start = Math.max(1, page - PAGE_WINDOW);
  const end = Math.min(lastPage, page + PAGE_WINDOW);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

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
  logo: File | null;
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
  logo: null,
});

const toNumber = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/** The numbered circle in front of every step, ticked once the step is filled. */
function StepBadge({ index, done }: { index: number; done: boolean }) {
  return (
    <Box
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
        done ? "border-success/40 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground",
      )}
    >
      {done ? <Check className="size-3.5" /> : index}
    </Box>
  );
}

/**
 * Add Products — a full PAGE holding one TABLE that creates and configures
 * together.
 *
 * The row stays compact (which service, its modal, the price it will sell at),
 * and the per-product configuration opens as a NUMBERED ACCORDION on the row
 * itself: 1. Product Data, 2. Pricing & Margin, 3. Price Limits, 4. Product Mix.
 * The steps are the guide — an admin never has to guess what still needs filling.
 *
 * Prices are authored as a MARGIN per membership plan. Leaving a margin empty
 * means "follow the pricing rules" — the same contract the API writes — so the
 * price shown is the rule's (`ceil(cost × (1 + %/100)) + flat`). A staged mix
 * adds its components' costs to the modal, so the preview and the margin
 * simulation measure against the SAME accumulated cost the server will store.
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
  // Server-backed: the API sorts the whole candidate universe by cost, not just
  // the page on screen. Both price headers share it (see `toggleSort`).
  const [sort, setSort] = useState<PoolSort | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [forms, setForms] = useState<Record<string, RowForm>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  // The pool row is only on screen for the current page, so the cost and provider
  // name are snapshotted at selection time — the review needs them after paging.
  const [selectedMeta, setSelectedMeta] = useState<Record<string, SelectedMeta>>({});
  // Which review the admin asked for, if any: { publish } opens the dialog; it is null when closed.
  const [review, setReview] = useState<{ publish: boolean } | null>(null);

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
      sort,
    }),
    [search, page, providerCategory, categoryId, sort],
  );

  const { data, isLoading } = usePoolCandidates(params);
  const { data: plans = [] } = useMarginPlanOptions();
  const { data: pricingRules = [] } = usePricingRuleOptions();
  // Sub-categories belong to a category. With the list filtered to one, every
  // row shares the same options — which is why the filter is the honest place
  // to read them from rather than guessing per row.
  const { categoryOptions: catalogueCategoryOptions, subCategoryOptions } = useProductSelectOptions(categoryId || undefined);
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

  const mixProductOptions = useMemo<MixProductOption[]>(
    () =>
      (catalogue?.data ?? []).map((product) => ({
        id: product.id,
        name: product.name,
        code: product.code,
        // The product's own cost — what a component adds to the bundle's modal.
        cost: product.variants[0]?.cost_price ?? 0,
      })),
    [catalogue],
  );

  const mixCostById = useMemo(
    () => new Map(mixProductOptions.map((option) => [option.id, option.cost])),
    [mixProductOptions],
  );

  const mixCost = useCallback(
    (form: RowForm) =>
      form.mix.reduce((sum, line) => sum + (mixCostById.get(line.productId) ?? 0) * (Number(line.quantity) || 0), 0),
    [mixCostById],
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
    setExpanded(null);
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

  // Cost asc → cost desc → provider order. Both price headers share this one
  // value, so the two columns never disagree about the order.
  const toggleSort = () => {
    setSort((current) => (current === "cost_asc" ? "cost_desc" : current === "cost_desc" ? undefined : "cost_asc"));
    setPage(1);
  };

  const sortLabel =
    sort === "cost_asc"
      ? t("sortPriceAsc")
      : sort === "cost_desc"
        ? t("sortPriceDesc")
        : t("sortPriceNone");

  const toggle = (
    row: { buyer_sku_code: string; name: string; cost: number; mapped_category_name: string | null },
    disabled: boolean,
  ) => {
    if (disabled) return;

    const code = row.buyer_sku_code;
    const alreadySelected = selected.includes(code);

    if (alreadySelected) {
      setSelected((current) => current.filter((entry) => entry !== code));
      setSelectedMeta((current) => {
        const next = { ...current };
        delete next[code];
        return next;
      });
      setExpanded((open) => (open === code ? null : open));
      return;
    }

    setForms((existing) => (existing[code] ? existing : { ...existing, [code]: emptyForm(row.name) }));
    setSelectedMeta((current) => ({
      ...current,
      [code]: { cost: row.cost, providerName: row.name, mappedCategoryName: row.mapped_category_name ?? "" },
    }));
    setSelected((current) => (currentMode === "single" ? [code] : [...current.filter((entry) => entry !== code), code]));

    // Ticking a row opens its steps straight away — that is the guide, in both
    // Single and Bulk. Opening them by hand would be a second, unneeded click.
    setExpanded(code);
  };

  const patch = (code: string, changes: Partial<RowForm>) =>
    setForms((current) => ({ ...current, [code]: { ...current[code], ...changes } }));

  // Sub-categories can only be chosen when the list is filtered to a category
  // that actually has them — only then can a missing one block the confirm.
  const subCategoryRequired = Boolean(categoryId) && subCategoryOptions.length > 0;

  // The exact rows the dialog will show, assembled from the same pricing helper
  // the table previews with, so nothing can drift between the two.
  const reviewItems = useMemo(
    () =>
      selected.map((code) => {
        const form = forms[code] ?? emptyForm(code);
        return buildReviewItem({
          buyerSkuCode: code,
          form,
          meta: selectedMeta[code],
          plans,
          ruleForPlan,
          planLabel,
          categoryName: catalogueCategoryOptions.find((option) => option.value === categoryId)?.label,
          subCategoryName: subCategoryOptions.find((option) => option.value === form.subCategoryId)?.label,
          mixOptions: mixProductOptions,
          currentMode,
          subCategoryRequired,
        });
      }),
    [
      selected,
      forms,
      selectedMeta,
      plans,
      ruleForPlan,
      planLabel,
      catalogueCategoryOptions,
      categoryId,
      subCategoryOptions,
      mixProductOptions,
      currentMode,
      subCategoryRequired,
    ],
  );

  const startReview = (publish: boolean) => setReview({ publish });

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
            logo: form.logo,
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
          setSelectedMeta({});
          setReview(null);
          backToList();
        },
      },
    );

  return (
    <Box className="flex h-full min-h-0 flex-col gap-6">
      {/* The page header is hidden on purpose — the breadcrumb already names the
          screen, and the table wants the vertical space. Kept for a11y/tests. */}
      <Heading
        level={1}
        variant="section"
        className="sr-only"
      >
        {t("addProductsTitle")}
      </Heading>

      <Box className="flex min-h-0 flex-1 flex-col gap-6 rounded-2xl border border-border bg-card p-6">
        {/* Filters and mode, in one strip — the two things that decide which
            rows are on screen and how many may be ticked. */}
        <Box className="flex shrink-0 flex-wrap items-end gap-3">
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

        <Box className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
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
                <tr>
                  <th className="sticky top-0 z-10 w-10 bg-muted px-3 py-2" />
                  <th className="sticky top-0 z-10 min-w-56 bg-muted px-3 py-2 font-medium">
                    <Box className="flex items-center gap-1.5">
                      {t("colService")}
                      <InfoTooltip content={t("tipColCodeSubCategory")} />
                    </Box>
                  </th>
                  <th className="sticky top-0 z-10 min-w-40 bg-muted px-3 py-2 font-medium">
                    <Box className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-8 gap-1 px-2 font-medium"
                        aria-label={`${t("cost")}: ${sortLabel}`}
                        title={sortLabel}
                        onClick={toggleSort}
                      >
                        {t("cost")}
                        {sort === "cost_asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : sort === "cost_desc" ? (
                          <ArrowDown className="size-3.5" />
                        ) : (
                          <ArrowUpDown className="size-3.5 text-muted-foreground/50" />
                        )}
                      </Button>
                      <InfoTooltip content={t("tipCost")} />
                    </Box>
                  </th>
                  <th className="sticky top-0 z-10 min-w-40 bg-muted px-3 py-2 font-medium">
                    <Box className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-8 gap-1 px-2 font-medium"
                        aria-label={`${t("sellPrice")}: ${sortLabel}`}
                        title={sortLabel}
                        onClick={toggleSort}
                      >
                        {t("sellPrice")}
                        {sort === "cost_asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : sort === "cost_desc" ? (
                          <ArrowDown className="size-3.5" />
                        ) : (
                          <ArrowUpDown className="size-3.5 text-muted-foreground/50" />
                        )}
                      </Button>
                      <InfoTooltip content={t("tipPriceColumn")} />
                    </Box>
                  </th>
                  <th className="sticky top-0 z-10 w-40 bg-muted px-3 py-2" />
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
                  const mixTotal = mixCost(form);
                  const accumulated = row.cost + mixTotal;

                  const stepDataDone =
                    form.subCategoryId !== "" ||
                    form.logo !== null ||
                    form.points !== "" ||
                    form.pointsFlat !== "" ||
                    form.discountValue !== "";
                  const stepPricingDone = Object.values(form.margins).some((value) => value !== "");
                  const stepLimitsDone = form.priceMin !== "" || form.priceMax !== "";
                  const stepMixDone = form.mix.some((line) => line.productId !== "");
                  const totalSteps = currentMode === "single" ? 4 : 3;
                  const doneSteps =
                    [stepDataDone, stepPricingDone, stepLimitsDone, stepMixDone].slice(0, totalSteps).filter(Boolean).length;

                  const defaultPlan = plans.find((plan) => plan.is_default) ?? plans[0];
                  const defaultPrice = defaultPlan
                    ? resolvePlanPrice(
                        accumulated,
                        toNumber(form.margins[defaultPlan.value] ?? ""),
                        ruleForPlan(defaultPlan.value),
                      ).price
                    : accumulated;

                  const simulationRows: MarginSimulationRow[] = plans.map((plan) => {
                    const price = resolvePlanPrice(
                      accumulated,
                      toNumber(form.margins[plan.value] ?? ""),
                      ruleForPlan(plan.value),
                    ).price;
                    return { key: plan.value, label: `${planLabel(plan)} (%)`, price };
                  });

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
                          <Box className="flex flex-col gap-1">
                            <Text className="font-medium">{code}</Text>
                            <Text
                              variant="small"
                              className="text-muted-foreground"
                            >
                              {row.name}
                            </Text>
                            {alreadyAdded && (
                              <Text
                                variant="small"
                                className="text-muted-foreground"
                              >
                                {t("alreadyAdded")}
                              </Text>
                            )}
                          </Box>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Box className="flex flex-col gap-0.5">
                            <Text className="tabular-nums">{rupiah(accumulated)}</Text>
                            {mixTotal > 0 && (
                              <Text
                                variant="small"
                                className="text-muted-foreground"
                              >
                                {rupiah(row.cost)} + {rupiah(mixTotal)}
                              </Text>
                            )}
                          </Box>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Box className="flex flex-col gap-0.5">
                            <Text className="font-medium tabular-nums">{rupiah(defaultPrice)}</Text>
                            {defaultPlan && (
                              <Text
                                variant="small"
                                className="text-muted-foreground"
                              >
                                {planLabel(defaultPlan)}
                              </Text>
                            )}
                          </Box>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Box className="flex flex-col items-start gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              disabled={!isSelected}
                              onClick={() => setExpanded(expanded === code ? null : code)}
                            >
                              <SlidersHorizontal className="size-4" />
                              {t("configure")}
                            </Button>
                            <Text
                              variant="small"
                              className="text-muted-foreground"
                            >
                              {t("stepSummary", { done: doneSteps, total: totalSteps })}
                            </Text>
                          </Box>
                        </td>
                      </tr>

                      {/* The guided steps: everything per-product lives here and
                          shuts until the admin opens the row they mean. */}
                      {expanded === code && isSelected && (
                        <tr>
                          <td
                            colSpan={5}
                            className="border-t border-border bg-muted/20 px-4 py-2"
                          >
                            <Accordion
                              type="multiple"
                              defaultValue={["data"]}
                            >
                              <AccordionItem value="data">
                                <AccordionTrigger>
                                  <Box className="flex items-center gap-3">
                                    <StepBadge
                                      index={1}
                                      done={stepDataDone}
                                    />
                                    <Text
                                      as="span"
                                      className="font-medium"
                                    >
                                      {t("stepData")}
                                    </Text>
                                  </Box>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <Box className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    <SelectField
                                      id={`${code}-sub-category`}
                                      label={t("subCategory")}
                                      tooltip={t("tipSubCategory")}
                                      options={subCategoryOptions}
                                      value={form.subCategoryId}
                                      disabled={subCategoryDisabled}
                                      emptyLabel={subCategoryDisabled ? t("chooseCategoryFirst") : t("noSubCategory")}
                                      onChange={(value) => patch(code, { subCategoryId: value })}
                                    />
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
                                        value={form.subName}
                                        onChange={(event) => patch(code, { subName: event.target.value })}
                                      />
                                    </Box>
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
                                        disabled={!form.discountType}
                                        value={form.discountValue}
                                        onChange={(event) => patch(code, { discountValue: event.target.value })}
                                      />
                                    </Box>
                                    <Box className="sm:col-span-2 lg:col-span-3">
                                      <ImageDropzone
                                        id={`${code}-logo`}
                                        label={t("productLogo")}
                                        caption={t("logoCaption")}
                                        tooltip={t("tipLogo")}
                                        value={form.logo ?? undefined}
                                        onChange={(file) => patch(code, { logo: file })}
                                        uploading={addProducts.isPending}
                                      />
                                    </Box>
                                  </Box>
                                </AccordionContent>
                              </AccordionItem>

                              <AccordionItem value="pricing">
                                <AccordionTrigger>
                                  <Box className="flex items-center gap-3">
                                    <StepBadge
                                      index={2}
                                      done={stepPricingDone}
                                    />
                                    <Text
                                      as="span"
                                      className="font-medium"
                                    >
                                      {t("stepPricing")}
                                    </Text>
                                  </Box>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <Box className="flex flex-col gap-4">
                                    <Box className="flex items-center justify-between gap-2 border-b border-border pb-2">
                                      <Box className="flex items-center gap-1.5">
                                        <Text
                                          as="span"
                                          variant="small"
                                          className="font-medium"
                                        >
                                          {t("cost")}
                                        </Text>
                                        <InfoTooltip content={mixTotal > 0 ? t("mixCostNote") : t("tipCost")} />
                                      </Box>
                                      <Text
                                        as="span"
                                        variant="small"
                                        className="tabular-nums text-muted-foreground"
                                      >
                                        {rupiah(accumulated)}
                                        {mixTotal > 0 ? ` (${rupiah(row.cost)} + ${rupiah(mixTotal)})` : ""}
                                      </Text>
                                    </Box>

                                    {plans.length === 0 ? (
                                      <Text variant="muted">{t("noPricedPlans")}</Text>
                                    ) : (
                                      <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {plans.map((plan) => {
                                          const rule = ruleForPlan(plan.value);
                                          return (
                                            <Box
                                              key={plan.value}
                                              className="flex flex-col gap-1.5"
                                            >
                                              <FieldLabel
                                                htmlFor={`${code}-margin-${plan.value}`}
                                                tooltip={t("tipMargin")}
                                              >
                                                {planLabel(plan)} (%)
                                              </FieldLabel>
                                              <Input
                                                id={`${code}-margin-${plan.value}`}
                                                className="rounded-xl text-right tabular-nums"
                                                inputMode="decimal"
                                                placeholder={rule ? `${rule.markup_percent}%` : t("pricingRules")}
                                                aria-label={`${code} ${plan.label} margin`}
                                                value={form.margins[plan.value] ?? ""}
                                                onChange={(event) =>
                                                  patch(code, {
                                                    margins: { ...form.margins, [plan.value]: event.target.value },
                                                  })
                                                }
                                              />
                                            </Box>
                                          );
                                        })}
                                      </Box>
                                    )}

                                    <MarginSimulationCard
                                      cost={accumulated}
                                      rows={simulationRows}
                                      breakdown={mixTotal > 0 ? { main: row.cost, mix: mixTotal } : undefined}
                                    />
                                  </Box>
                                </AccordionContent>
                              </AccordionItem>

                              <AccordionItem value="limits">
                                <AccordionTrigger>
                                  <Box className="flex items-center gap-3">
                                    <StepBadge
                                      index={3}
                                      done={stepLimitsDone}
                                    />
                                    <Text
                                      as="span"
                                      className="font-medium"
                                    >
                                      {t("stepLimits")}
                                    </Text>
                                  </Box>
                                </AccordionTrigger>
                                <AccordionContent>
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
                                </AccordionContent>
                              </AccordionItem>

                              <AccordionItem value="mix">
                                <AccordionTrigger>
                                  <Box className="flex items-center gap-3">
                                    <StepBadge
                                      index={4}
                                      done={stepMixDone}
                                    />
                                    <Text
                                      as="span"
                                      className="font-medium"
                                    >
                                      {t("stepMix")}
                                    </Text>
                                  </Box>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <Box className="flex flex-col gap-2">
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
                                          onClick={() =>
                                            patch(code, { mix: [...form.mix, { productId: "", quantity: "1" }] })
                                          }
                                        >
                                          <Plus className="size-4" />
                                          {t("addMix")}
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
                                            <Box className="flex flex-col gap-1.5">
                                              <FieldLabel
                                                htmlFor={`${code}-mix-${index}`}
                                                tooltip={t("tipMixProduct")}
                                              >
                                                {t("mainProduct")}
                                              </FieldLabel>
                                              <MixProductPicker
                                                id={`${code}-mix-${index}`}
                                                ariaLabel={`${code} mix ${index + 1} product`}
                                                value={line.productId}
                                                options={mixProductOptions}
                                                onChange={(value) =>
                                                  patch(code, {
                                                    mix: form.mix.map((entry, i) =>
                                                      i === index ? { ...entry, productId: value } : entry,
                                                    ),
                                                  })
                                                }
                                              />
                                            </Box>
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
                                              onClick={() =>
                                                patch(code, { mix: form.mix.filter((_, i) => i !== index) })
                                              }
                                            >
                                              <Minus className="size-4" />
                                            </Button>
                                          </Box>
                                        ))}
                                        {mixTotal > 0 && (
                                          <Text
                                            variant="small"
                                            className="text-muted-foreground"
                                          >
                                            {t("mixCostNote")}: {rupiah(mixTotal)}
                                          </Text>
                                        )}
                                      </Box>
                                    )}
                                  </Box>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
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

        <Box className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <Text variant="small">{t("pageOf", { page, last: lastPage })}</Text>
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={page <= 1}
                  className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    if (page > 1) setPage(page - 1);
                  }}
                />
              </PaginationItem>
              {pageWindow(page, lastPage).map((pageNumber) => (
                <PaginationItem key={pageNumber}>
                  <PaginationLink
                    href="#"
                    isActive={pageNumber === page}
                    className="tabular-nums"
                    onClick={(event) => {
                      event.preventDefault();
                      setPage(pageNumber);
                    }}
                  >
                    {pageNumber}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={page >= lastPage}
                  className={page >= lastPage ? "pointer-events-none opacity-50" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    if (page < lastPage) setPage(page + 1);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </Box>

        <Box className="flex shrink-0 items-center justify-end gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={backToList}
          >
            {t("cancel")}
          </Button>
          {/* Draft first (the safe choice), publish second (the deliberate one).
              Both open the review first — the dialog's confirm is what sends. */}
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={selected.length === 0 || addProducts.isPending}
            onClick={() => startReview(false)}
          >
            {t("saveDraft")} ({selected.length})
          </Button>
          <Button
            className="rounded-xl"
            disabled={selected.length === 0 || addProducts.isPending}
            onClick={() => startReview(true)}
          >
            {t("publishNow")} ({selected.length})
          </Button>
        </Box>
      </Box>

      <AddProductsReviewDialog
        open={review !== null}
        onOpenChange={(next) => {
          if (!next) setReview(null);
        }}
        publish={review?.publish ?? false}
        items={reviewItems}
        isPending={addProducts.isPending}
        onConfirm={() => {
          if (review) submit(review.publish);
        }}
      />
    </Box>
  );
}
