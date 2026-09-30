import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, Search, SlidersHorizontal } from "lucide-react";

import { Box } from "@/components/common/Box";
import { SelectField } from "@/components/common/SelectField";
import { Text } from "@/components/common/Text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/utils/currency";
import { usePoolCandidates, usePoolFacets } from "../hooks/useProviderPool";
import { useMarginPlanOptions } from "../hooks/useProviderProducts";
import { useAddProductsFromSupplier, useProductList } from "../hooks/useProducts";
import { useProductSelectOptions } from "../hooks/useProductSelectOptions";

export type AddMode = "single" | "bulk";

interface AddProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Single adds one product; bulk takes many. Switchable inside the dialog. */
  mode: AddMode;
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
 * Add Products — one TABLE that creates and configures together.
 *
 * The rows are the filtered provider price list, not a stack of forms: picking a
 * service makes its row editable in place, so fifty of them stay one screen and
 * two rows can be compared at a glance. `Modal` (the supplier's cost) stays
 * visible beside the sell prices the admin's margins produce, which is the whole
 * reason a bulk screen is worth having.
 *
 * Prices are authored as a MARGIN; the resulting price is shown, never typed.
 * The server still owns the maths (`PricingService`) — what is displayed here is
 * a preview of it.
 */
export function AddProductsDialog({ open, onOpenChange, mode }: AddProductsDialogProps) {
  const { t } = useTranslation("products");
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

  const { data, isLoading } = usePoolCandidates(params, open);
  const { data: plans = [] } = useMarginPlanOptions();
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

  const toggle = (row: { buyer_sku_code: string; name: string }, disabled: boolean) => {
    if (disabled) return;

    const code = row.buyer_sku_code;

    setSelected((current) => {
      if (current.includes(code)) return current.filter((entry) => entry !== code);

      setForms((existing) => (existing[code] ? existing : { ...existing, [code]: emptyForm(row.name) }));

      // Single: ticking a second row REPLACES the first, rather than refusing
      // the click — the admin means "this one, not that one".
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
            mix_items: form.mix
              .filter((line) => line.productId !== "")
              .map((line) => ({ product_id: line.productId, quantity: line.quantity || "1" })),
          };
        }),
      },
      {
        onSuccess: () => {
          setSelected([]);
          setForms({});
          onOpenChange(false);
        },
      },
    );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("addProductsTitle")}</DialogTitle>
          <DialogDescription>{t("addProductsSubtitle")}</DialogDescription>
        </DialogHeader>

        {/* Filters and mode, in one strip — the two things that decide which
            rows are on screen and how many may be ticked. */}
        <Box className="flex flex-wrap items-end gap-2">
          <Box className="w-56">
            <SelectField
              id="add-provider-filter"
              label={t("supplier")}
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
              label={t("ourCategory")}
              options={categoryOptions}
              value={categoryId || NONE}
              onChange={(next) => {
                setCategoryId(next === NONE ? "" : next);
                setPage(1);
              }}
            />
          </Box>
          <Box className="flex-1">
            <Box className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
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
          {(["single", "bulk"] as AddMode[]).map((value) => (
            <Button
              key={value}
              type="button"
              variant={currentMode === value ? "default" : "outline"}
              className="rounded-xl"
              onClick={() => {
                setCurrentMode(value);
                if (value === "single") setSelected((current) => current.slice(0, 1));
              }}
            >
              {t(value === "single" ? "single" : "bulk")}
            </Button>
          ))}
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
                  <th className="px-3 py-2 font-medium">{t("colCodeSubCategory")}</th>
                  <th className="px-3 py-2 font-medium">{t("colPointsDiscount")}</th>
                  <th className="px-3 py-2 font-medium">{t("productName")}</th>
                  <th className="px-3 py-2 font-medium">{t("price")}</th>
                  <th className="w-24 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const alreadyAdded = row.already_promoted || row.already_pooled;
                  const isSelected = selected.includes(row.buyer_sku_code);
                  const form = forms[row.buyer_sku_code] ?? emptyForm(row.name);
                  // Without a category filter the sub-category list is unknown,
                  // so the control says so instead of offering the wrong set.
                  const subCategoryDisabled = !categoryId;

                  return (
                    <>
                      <tr
                        key={row.id}
                        className={alreadyAdded ? "opacity-50" : ""}
                      >
                        <td className="px-3 py-3 align-top">
                          <Checkbox
                            checked={isSelected}
                            disabled={alreadyAdded}
                            aria-label={`Select ${row.buyer_sku_code}`}
                            onCheckedChange={() => toggle(row, alreadyAdded)}
                          />
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Text className="font-medium">{row.buyer_sku_code}</Text>
                          <SelectField
                            id={`${row.buyer_sku_code}-sub-category`}
                            label=""
                            options={subCategoryOptions}
                            value={form.subCategoryId}
                            disabled={!isSelected || subCategoryDisabled}
                            emptyLabel={subCategoryDisabled ? t("chooseCategoryFirst") : t("noSubCategory")}
                            onChange={(value) => patch(row.buyer_sku_code, { subCategoryId: value })}
                          />
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Box className="flex flex-col gap-2">
                            <Box className="flex items-center gap-2">
                              <Input
                                className="w-20 rounded-xl tabular-nums"
                                inputMode="numeric"
                                aria-label={`${row.buyer_sku_code} points`}
                                disabled={!isSelected}
                                value={form.points}
                                onChange={(event) => patch(row.buyer_sku_code, { points: event.target.value })}
                              />
                              <Input
                                className="w-20 rounded-xl tabular-nums"
                                inputMode="numeric"
                                aria-label={`${row.buyer_sku_code} bonus`}
                                disabled={!isSelected}
                                value={form.pointsFlat}
                                onChange={(event) => patch(row.buyer_sku_code, { pointsFlat: event.target.value })}
                              />
                            </Box>
                            <Box className="flex items-center gap-2">
                              <SelectField
                                id={`${row.buyer_sku_code}-discount-type`}
                                label=""
                                options={[
                                  { value: NONE, label: t("noDiscount") },
                                  { value: "percent", label: t("discountPercentOption") },
                                  { value: "fixed", label: t("discountFixedOption") },
                                ]}
                                value={form.discountType || NONE}
                                disabled={!isSelected}
                                onChange={(next) =>
                                  patch(row.buyer_sku_code, {
                                    discountType: (next === NONE ? "" : next) as RowForm["discountType"],
                                  })
                                }
                              />
                              <Input
                                className="w-20 rounded-xl tabular-nums"
                                inputMode="numeric"
                                aria-label={`${row.buyer_sku_code} discount`}
                                disabled={!isSelected || !form.discountType}
                                value={form.discountValue}
                                onChange={(event) => patch(row.buyer_sku_code, { discountValue: event.target.value })}
                              />
                            </Box>
                          </Box>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Box className="flex flex-col gap-2">
                            <Input
                              className="rounded-xl"
                              aria-label={`${row.buyer_sku_code} name`}
                              disabled={!isSelected}
                              value={form.name}
                              onChange={(event) => patch(row.buyer_sku_code, { name: event.target.value })}
                            />
                            <Input
                              className="rounded-xl"
                              placeholder={t("subName")}
                              aria-label={`${row.buyer_sku_code} sub name`}
                              disabled={!isSelected}
                              value={form.subName}
                              onChange={(event) => patch(row.buyer_sku_code, { subName: event.target.value })}
                            />
                          </Box>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Text
                            variant="small"
                            className="text-muted-foreground"
                          >
                            {t("cost")}: {rupiah(row.cost)}
                          </Text>
                          <Box className="mt-1 flex flex-col gap-1">
                            {plans.map((plan) => {
                              const margin = toNumber(form.margins[plan.value] ?? "");
                              const price = margin === null ? row.cost : Math.ceil(row.cost * (1 + margin / 100));

                              return (
                                <Box
                                  key={plan.value}
                                  className="flex items-center gap-2"
                                >
                                  <Text
                                    variant="small"
                                    className="w-20 shrink-0"
                                  >
                                    {plan.label}
                                  </Text>
                                  <Input
                                    className="w-16 rounded-xl tabular-nums"
                                    inputMode="decimal"
                                    aria-label={`${row.buyer_sku_code} ${plan.label} margin`}
                                    disabled={!isSelected}
                                    value={form.margins[plan.value] ?? ""}
                                    onChange={(event) =>
                                      patch(row.buyer_sku_code, {
                                        margins: { ...form.margins, [plan.value]: event.target.value },
                                      })
                                    }
                                  />
                                  <Badge variant="secondary">{rupiah(price)}</Badge>
                                </Box>
                              );
                            })}
                          </Box>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-xl"
                            disabled={!isSelected}
                            onClick={() => setExpanded(expanded === row.buyer_sku_code ? null : row.buyer_sku_code)}
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
                      {expanded === row.buyer_sku_code && (
                        <tr key={`${row.id}-detail`}>
                          <td
                            colSpan={6}
                            className="border-t border-border bg-muted/20 px-3 py-3"
                          >
                            <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <Box className="flex items-center gap-2">
                                <Text
                                  variant="small"
                                  className="w-28 shrink-0"
                                >
                                  {t("lowerLimit")}
                                </Text>
                                <Input
                                  className="rounded-xl tabular-nums"
                                  inputMode="numeric"
                                  aria-label={`${row.buyer_sku_code} price min`}
                                  value={form.priceMin}
                                  onChange={(event) => patch(row.buyer_sku_code, { priceMin: event.target.value })}
                                />
                                <Text
                                  variant="small"
                                  className="w-28 shrink-0"
                                >
                                  {t("upperLimit")}
                                </Text>
                                <Input
                                  className="rounded-xl tabular-nums"
                                  inputMode="numeric"
                                  aria-label={`${row.buyer_sku_code} price max`}
                                  value={form.priceMax}
                                  onChange={(event) => patch(row.buyer_sku_code, { priceMax: event.target.value })}
                                />
                              </Box>
                            </Box>

                            <Box className="mt-3 flex flex-col gap-2">
                              <Box className="flex items-center justify-between">
                                <Text className="font-medium">{t("tabProductMix")}</Text>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="rounded-xl"
                                  onClick={() =>
                                    patch(row.buyer_sku_code, {
                                      mix: [...form.mix, { productId: "", quantity: "1" }],
                                    })
                                  }
                                >
                                  <Plus className="size-4" />{t("addMix")}
                                </Button>
                              </Box>

                              {form.mix.map((line, index) => (
                                <Box
                                  key={index}
                                  className="flex items-end gap-2"
                                >
                                  <Box className="w-72">
                                    <SelectField
                                      id={`${row.buyer_sku_code}-mix-${index}`}
                                      label={t("mainProduct")}
                                      options={componentOptions}
                                      value={line.productId}
                                      onChange={(value) =>
                                        patch(row.buyer_sku_code, {
                                          mix: form.mix.map((entry, i) =>
                                            i === index ? { ...entry, productId: value } : entry,
                                          ),
                                        })
                                      }
                                    />
                                  </Box>
                                  <Input
                                    className="w-20 rounded-xl"
                                    inputMode="numeric"
                                    aria-label={`${row.buyer_sku_code} mix ${index + 1} quantity`}
                                    value={line.quantity}
                                    onChange={(event) =>
                                      patch(row.buyer_sku_code, {
                                        mix: form.mix.map((entry, i) =>
                                          i === index ? { ...entry, quantity: event.target.value } : entry,
                                        ),
                                      })
                                    }
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Remove mix ${index + 1}`}
                                    className="rounded-xl"
                                    onClick={() =>
                                      patch(row.buyer_sku_code, {
                                        mix: form.mix.filter((_, i) => i !== index),
                                      })
                                    }
                                  >
                                    <Minus className="size-4" />
                                  </Button>
                                </Box>
                              ))}
                            </Box>
                          </td>
                        </tr>
                      )}
                    </>
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
            onClick={() => onOpenChange(false)}
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
      </DialogContent>
    </Dialog>
  );
}
