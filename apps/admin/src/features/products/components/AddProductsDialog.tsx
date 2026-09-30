import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Minus, Plus, Search } from "lucide-react";

import { Box } from "@/components/common/Box";
import { SelectField } from "@/components/common/SelectField";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/utils/currency";
import { usePoolCandidates } from "../hooks/useProviderPool";
import { useMarginPlanOptions } from "../hooks/useProviderProducts";
import { useAddProductsFromSupplier, useProductList } from "../hooks/useProducts";

export type AddMode = "single" | "bulk";

interface AddProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Single adds one product; bulk takes many. Switchable inside the dialog. */
  mode: AddMode;
}

const PER_PAGE = 10;
const rupiah = (value: number) => formatCurrency(value, { fractionDigits: 0 });

/** One product's editable data. Strings, because they are inputs. */
interface DraftForm {
  name: string;
  code: string;
  discountType: "" | "percent" | "fixed";
  discountValue: string;
  points: string;
  pointsFlat: string;
  priceMin: string;
  priceMax: string;
  margins: Record<string, string>;
  mix: { productId: string; quantity: string }[];
}

const emptyForm = (name: string, code: string): DraftForm => ({
  name,
  code,
  discountType: "",
  discountValue: "",
  points: "",
  pointsFlat: "",
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
 * Add Products — one modal that creates AND configures, for one product or many.
 *
 * It replaces the pool's two screens and the older "create a draft, then go and
 * price it" split: the admin picks provider services, fills in name, discount,
 * points, price window, margins and the mix right here, then either publishes or
 * leaves them as drafts. One screen, one submit.
 *
 * The SKU list is paginated server-side — a whole game's catalogue is hundreds
 * of rows, and an endless scroll is what the old panel had.
 */
export function AddProductsDialog({ open, onOpenChange, mode }: AddProductsDialogProps) {
  const { t } = useTranslation("products");
  // The menu's choice seeds the dialog. It is NOT re-synced by an effect: the
  // parent mounts a fresh dialog per open, so state resets by construction
  // rather than by a cascading render.
  const [currentMode, setCurrentMode] = useState<AddMode>(mode);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [forms, setForms] = useState<Record<string, DraftForm>>({});

  const params = useMemo(
    () => ({
      search: search || undefined,
      page,
      per_page: PER_PAGE,
      // "all", not "not_pooled": a service that is already ours must be VISIBLE
      // and un-tickable, which is the only way the admin can tell the difference
      // between "not added yet" and "already added".
      pool_state: "all",
      availability: "all",
    }),
    [search, page],
  );

  const { data, isLoading } = usePoolCandidates(params, open);
  const { data: plans = [] } = useMarginPlanOptions();
  const { data: catalogue } = useProductList({ per_page: 100 });
  const addProducts = useAddProductsFromSupplier();

  const rows = data?.data ?? [];
  const lastPage = data?.meta.last_page ?? 1;

  const componentOptions = useMemo(
    () =>
      (catalogue?.data ?? []).map((product) => ({
        value: product.id,
        label: `${product.name} — ${product.code}`,
      })),
    [catalogue],
  );

  const toggle = (code: string, disabled: boolean) => {
    if (disabled) return;

    setSelected((current) => {
      if (current.includes(code)) return current.filter((entry) => entry !== code);

      // Single: checking a second row replaces the first, rather than refusing
      // the click — the admin's intent is "this one, not that one".
      const next = currentMode === "single" ? [code] : [...current, code];

      setForms((forms) => {
        if (forms[code]) return forms;
        const row = rows.find((entry) => entry.buyer_sku_code === code);
        return { ...forms, [code]: emptyForm(row?.name ?? code, code) };
      });

      return next;
    });
  };

  const patch = (code: string, changes: Partial<DraftForm>) =>
    setForms((current) => ({ ...current, [code]: { ...current[code], ...changes } }));

  const submit = (publish: boolean) =>
    addProducts.mutate(
      {
        publish,
        items: selected.map((code) => {
          const form = forms[code] ?? emptyForm(code, code);
          const margins: Record<string, number | null> = {};

          for (const plan of plans) {
            margins[plan.value] = toNumber(form.margins[plan.value] ?? "");
          }

          return {
            buyer_sku_code: code,
            name: form.name || undefined,
            code: form.code || undefined,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("addProductsTitle")}</DialogTitle>
          <DialogDescription>{t("addProductsSubtitle")}</DialogDescription>
        </DialogHeader>

        {/* Mode first, because it decides how much may be ticked. */}
        <Box className="flex items-center gap-2">
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
          <Text
            variant="small"
            className="text-muted-foreground"
          >
            {t("selectedForDraft", { count: selected.length })}
          </Text>
        </Box>

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

        <Box className="rounded-xl border border-border">
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

          {!isLoading &&
            rows.map((row) => {
              const alreadyAdded = row.already_promoted || row.already_pooled;
              const isSelected = selected.includes(row.buyer_sku_code);

              return (
                <Box
                  key={row.id}
                  as="button"
                  type="button"
                  onClick={() => toggle(row.buyer_sku_code, alreadyAdded)}
                  className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 ${
                    alreadyAdded ? "cursor-not-allowed opacity-50" : "hover:bg-muted/50"
                  }`}
                >
                  <Box
                    className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input"
                    }`}
                  >
                    {isSelected && <Check className="size-3" />}
                  </Box>
                  <Box className="flex flex-1 flex-col">
                    <Text
                      as="span"
                      className="font-medium"
                    >
                      {row.name}
                    </Text>
                    <Text
                      as="span"
                      variant="small"
                      className="text-muted-foreground"
                    >
                      {row.buyer_sku_code} · {row.mapped_category_name ?? row.provider_category}
                      {alreadyAdded ? ` · ${t("alreadyAdded")}` : ""}
                    </Text>
                  </Box>
                  <Text
                    as="span"
                    variant="small"
                    className="tabular-nums"
                  >
                    {rupiah(row.cost)}
                  </Text>
                </Box>
              );
            })}
        </Box>

        {/* Pagination: the catalogue is hundreds of rows; an endless list is what
            the old panel had, and it is what this replaces. */}
        <Box className="flex items-center justify-between">
          <Text variant="small">
            {t("pageOf", { page, last: lastPage })}
          </Text>
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

        {selected.map((code) => {
          const form = forms[code] ?? emptyForm(code, code);

          return (
            <Box
              key={code}
              className="flex flex-col gap-4 rounded-xl border border-border p-4"
            >
              <Text className="font-medium">{code}</Text>

              <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Box className="flex flex-col gap-1.5">
                  <Label htmlFor={`${code}-name`}>{t("productName")}</Label>
                  <Input
                    id={`${code}-name`}
                    className="rounded-xl"
                    value={form.name}
                    onChange={(event) => patch(code, { name: event.target.value })}
                  />
                </Box>
                <Box className="flex flex-col gap-1.5">
                  <Label htmlFor={`${code}-code`}>{t("productCode")}</Label>
                  <Input
                    id={`${code}-code`}
                    className="rounded-xl"
                    value={form.code}
                    onChange={(event) => patch(code, { code: event.target.value })}
                  />
                </Box>
              </Box>

              <Box className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SelectField
                  id={`${code}-discount-type`}
                  label={t("discount")}
                  options={[
                    { value: "none", label: t("noDiscount") },
                    { value: "percent", label: t("discountPercentOption") },
                    { value: "fixed", label: t("discountFixedOption") },
                  ]}
                  value={form.discountType || "none"}
                  onChange={(next) =>
                    patch(code, {
                      discountType: (next === "none" ? "" : next) as DraftForm["discountType"],
                    })
                  }
                />
                <Box className="flex flex-col gap-1.5">
                  <Label htmlFor={`${code}-discount-value`}>{t("discountValue")}</Label>
                  <Input
                    id={`${code}-discount-value`}
                    className="rounded-xl tabular-nums"
                    inputMode="numeric"
                    disabled={!form.discountType}
                    value={form.discountValue}
                    onChange={(event) => patch(code, { discountValue: event.target.value })}
                  />
                </Box>
                <Box className="flex flex-col gap-1.5">
                  <Label htmlFor={`${code}-points`}>{t("points")}</Label>
                  <Input
                    id={`${code}-points`}
                    className="rounded-xl tabular-nums"
                    inputMode="numeric"
                    value={form.points}
                    onChange={(event) => patch(code, { points: event.target.value })}
                  />
                </Box>
              </Box>

              <Box className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Box className="flex flex-col gap-1.5">
                  <Label htmlFor={`${code}-points-flat`}>{t("bonusPoints")}</Label>
                  <Input
                    id={`${code}-points-flat`}
                    className="rounded-xl tabular-nums"
                    inputMode="numeric"
                    value={form.pointsFlat}
                    onChange={(event) => patch(code, { pointsFlat: event.target.value })}
                  />
                </Box>
                <Box className="flex flex-col gap-1.5">
                  <Label htmlFor={`${code}-price-min`}>{t("lowerLimit")}</Label>
                  <Input
                    id={`${code}-price-min`}
                    className="rounded-xl tabular-nums"
                    inputMode="numeric"
                    value={form.priceMin}
                    onChange={(event) => patch(code, { priceMin: event.target.value })}
                  />
                </Box>
                <Box className="flex flex-col gap-1.5">
                  <Label htmlFor={`${code}-price-max`}>{t("upperLimit")}</Label>
                  <Input
                    id={`${code}-price-max`}
                    className="rounded-xl tabular-nums"
                    inputMode="numeric"
                    value={form.priceMax}
                    onChange={(event) => patch(code, { priceMax: event.target.value })}
                  />
                </Box>
              </Box>

              {/* Margin per membership plan — the platform's own pricing axis. */}
              <Box className="flex flex-col gap-2">
                <Text className="font-medium">{t("tabPricingMargin")}</Text>
                {plans.length === 0 && (
                  <Text
                    variant="small"
                    className="text-muted-foreground"
                  >
                    {t("noPlans")}
                  </Text>
                )}
                <Box className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {plans.map((plan) => (
                    <Box
                      key={plan.value}
                      className="flex flex-col gap-1.5"
                    >
                      <Label htmlFor={`${code}-margin-${plan.value}`}>{plan.label}</Label>
                      <Input
                        id={`${code}-margin-${plan.value}`}
                        className="rounded-xl tabular-nums"
                        inputMode="decimal"
                        value={form.margins[plan.value] ?? ""}
                        onChange={(event) =>
                          patch(code, { margins: { ...form.margins, [plan.value]: event.target.value } })
                        }
                      />
                    </Box>
                  ))}
                </Box>
              </Box>

              {/* Mix: components are products we ALREADY have, which is the one
                  place the "cannot add twice" rule deliberately allows a
                  repeat. */}
              <Box className="flex flex-col gap-2">
                <Box className="flex items-center justify-between">
                  <Text className="font-medium">{t("tabProductMix")}</Text>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => patch(code, { mix: [...form.mix, { productId: "", quantity: "1" }] })}
                  >
                    <Plus className="size-4" />{t("addMix")}
                  </Button>
                </Box>

                {form.mix.map((line, index) => (
                  <Box
                    key={index}
                    className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[2fr_1fr_auto]"
                  >
                    <SelectField
                      id={`${code}-mix-${index}`}
                      label={t("mainProduct")}
                      options={componentOptions}
                      value={line.productId}
                      onChange={(value) =>
                        patch(code, {
                          mix: form.mix.map((entry, i) => (i === index ? { ...entry, productId: value } : entry)),
                        })
                      }
                    />
                    <Box className="flex flex-col gap-1.5">
                      <Label htmlFor={`${code}-mix-qty-${index}`}>{t("quantity")}</Label>
                      <Input
                        id={`${code}-mix-qty-${index}`}
                        className="rounded-xl"
                        inputMode="numeric"
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
            </Box>
          );
        })}

        <Box className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          {/* Draft first: it is the safe choice, and publish is the deliberate one. */}
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={selected.length === 0 || addProducts.isPending}
            onClick={() => submit(false)}
          >
            {t("saveDraft")}
          </Button>
          <Button
            className="rounded-xl"
            disabled={selected.length === 0 || addProducts.isPending}
            onClick={() => submit(true)}
          >
            {t("publishNow")}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
