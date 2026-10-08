import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Box } from "@/components/common/Box";
import { Heading } from "@/components/common/Heading";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { decimalOnly, digitsOnly } from "@/lib/numericInput";
import { PlanPriceCard } from "../components/PlanPriceCard";
import { ProductPriceCell } from "../components/ProductPriceCell";
import { useBulkSetProviderMargin, useMarginPlanOptions, useProviderProductList } from "../hooks/useProviderProducts";
import type { ProviderProduct } from "../types/product.type";

/**
 * The one value every selected row already carries, or `undefined` when they
 * disagree — a bulk edit must not pretend one row's number speaks for forty.
 */
function sharedValue(rows: ProviderProduct[], read: (row: ProviderProduct) => number | null | undefined): string {
  if (rows.length === 0) return "";

  const first = read(rows[0]);
  const agreed = rows.every((row) => read(row) === first);

  return agreed && first !== null && first !== undefined ? String(first) : "";
}

/**
 * Set Profit Margin (Bulk) — applies one set of per-plan margins to every
 * selected provider product. The left column stacks the selected items with
 * their price breakdown; the right form is applied to all. Selection is passed
 * as `?ids=1,2` so the page is linkable and survives a refresh.
 *
 * One field per membership plan, built from the plans that exist. It used to be
 * four fixed fields (Public/VIP/Reseller/Agent), which meant a plan an admin
 * created could never be given a margin.
 *
 * Saving stays on the page. It used to navigate straight back to the list,
 * which — together with a preview the API had stopped emitting — meant an admin
 * typed margins, pressed Save and never saw a single number change.
 */
export default function ProviderMarginBulkPage({ ids }: { ids: string[] }) {
  const { t } = useTranslation("products");
  const navigate = useNavigate();
  const bulkMargin = useBulkSetProviderMargin();
  const { data: plans = [] } = useMarginPlanOptions();
  // Only the fields the admin has actually touched. Everything else reads
  // through to the saved value, so the form needs no effect to seed itself and
  // a refetch after saving cannot clobber an in-progress edit.
  const [edits, setEdits] = useState<Record<string, string>>({});

  // Ask for exactly the selection. This used to pull one page and filter it in
  // the browser, which silently dropped any row that fell outside the first 100.
  const { data, isLoading } = useProviderProductList({
    ids: ids.join(","),
    per_page: Math.max(ids.length, 1),
  });
  const selected = useMemo(() => data?.data ?? [], [data]);
  // The selection size is known from the URL, so show exactly that many skeleton
  // cards (clamped) — a large bulk selection shouldn't stretch the column.
  const skeletonCount = Math.min(Math.max(ids.length, 1), 8);

  /** What the server already holds, keyed the way the inputs are. */
  const saved = useMemo<Record<string, string>>(() => {
    const values: Record<string, string> = {
      price_min: sharedValue(selected, (row) => row.price_min),
      price_max: sharedValue(selected, (row) => row.price_max),
      point_percent: sharedValue(selected, (row) => row.point_percent),
      point_flat: sharedValue(selected, (row) => row.point_flat),
      daily_order_limit: sharedValue(selected, (row) => row.daily_order_limit),
    };

    for (const plan of plans) {
      values[plan.value] = sharedValue(
        selected,
        (row) => row.plan_margins.find((margin) => String(margin.membership_plan_id) === plan.value)?.margin_percent,
      );
    }

    return values;
  }, [selected, plans]);

  const draft = useMemo<Record<string, string>>(() => ({ ...saved, ...edits }), [saved, edits]);

  const parse = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  const backToList = () => navigate({ to: "/admin/products/provider" });

  const setValue = (key: string, value: string) => setEdits((previous) => ({ ...previous, [key]: value }));

  /**
   * A field is only sent when it says something.
   *
   * Blank-and-untouched is not an instruction: across a bulk selection whose
   * rows disagree the field shows blank by design, and sending that would wipe
   * every row's margin. Blank-and-touched *is* an instruction — the admin
   * cleared it — and travels as null, "use the pricing rules".
   */
  const meaningful = (key: string): boolean => key in edits || (saved[key] ?? "") !== "";

  const onSubmit = () => {
    const margins: Record<number, number | null> = {};

    for (const plan of plans) {
      if (meaningful(plan.value)) {
        margins[Number(plan.value)] = parse(draft[plan.value] ?? "");
      }
    }

    const limits = meaningful("price_min") || meaningful("price_max")
      ? { price_min: parse(draft.price_min ?? ""), price_max: parse(draft.price_max ?? "") }
      : {};

    const points = meaningful("point_percent") || meaningful("point_flat")
      ? { point_percent: parse(draft.point_percent ?? ""), point_flat: parse(draft.point_flat ?? "") }
      : {};

    // Blank-and-touched clears the ceiling (null = unlimited); blank-and-untouched
    // leaves whatever each selected row already had.
    const dailyLimit = meaningful("daily_order_limit")
      ? { daily_order_limit: parse(draft.daily_order_limit ?? "") }
      : {};

    bulkMargin.mutate({ ids, input: { margins, ...limits, ...points, ...dailyLimit } });
  };

  return (
    <Box className="flex flex-col gap-6">
      <Box className="rounded-2xl border border-border bg-card p-6">
        <Heading level={1} variant="section">{t("setProfitMargin")}</Heading>
        <Text variant="muted">
          Set the selling price for {ids.length} provider product{ids.length === 1 ? "" : "s"}. Leave a margin empty to
          use the pricing rules. Saving here is what unlocks Promote — a SKU cannot reach the catalogue unpriced.
        </Text>
      </Box>

      <Box className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Box className="flex flex-col gap-3">
          {isLoading ? (
            Array.from({ length: skeletonCount }).map((_, index) => (
              <Box key={`skeleton-${index}`} className="rounded-2xl border border-border bg-card p-4">
                <Box className="flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-4 w-56" />
                </Box>
                <Skeleton className="mt-3 h-12 w-full" />
              </Box>
            ))
          ) : selected.length === 0 ? (
            <Box className="rounded-2xl border border-border bg-card p-6">
              <Text variant="muted">{t("noSelectedProducts")}</Text>
            </Box>
          ) : (
            selected.map((row) => (
              <Box key={row.id} className="rounded-2xl border border-border bg-card p-4">
                <Box className="flex flex-col gap-0.5">
                  <Text as="span" variant="small">
                    {row.category_name} · {row.product_code}
                  </Text>
                  <Text as="span" className="font-medium">
                    {row.product_name}
                  </Text>
                </Box>
                <Box className="mt-3">
                  {/* A pooled row prices per plan, which is what the form on the
                      right actually edits. A promoted one still reads its four
                      stored columns, so it keeps the legacy cell. */}
                  {row.preview_plan_prices.length > 0 ? (
                    <PlanPriceCard cost={row.variant.cost_price} plans={row.preview_plan_prices} />
                  ) : (
                    <ProductPriceCell variants={[row.variant]} />
                  )}
                </Box>
              </Box>
            ))
          )}
        </Box>

        <Box className="h-fit rounded-2xl border border-border bg-card p-6">
          <Box className="grid grid-cols-1 gap-4">
            {plans.length === 0 ? (
              <Text variant="muted">{t("noPlansSku")}</Text>
            ) : (
              plans.map((plan) => (
                <Box key={plan.value} className="flex flex-col gap-1.5">
                  {/* Two plans may legitimately share a display name (the default
                      "Basic" tier and the paid one), so the code disambiguates. */}
                  <Label htmlFor={`margin-${plan.value}`}>
                    {plan.label} ({plan.code}) margin (%){plan.is_default ? " · default tier" : ""}
                  </Label>
                  <Input
                    id={`margin-${plan.value}`}
                    inputMode="decimal"
                    value={draft[plan.value] ?? ""}
                    onChange={(e) => setValue(plan.value, decimalOnly(e.target.value))}
                    placeholder="0"
                  />
                </Box>
              ))
            )}
          </Box>
          <Box className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4">
            <Box className="flex flex-col gap-1.5">
              <Label htmlFor="price-min">{t("lowerLimit")}</Label>
              <Input
                id="price-min"
                inputMode="numeric"
                value={draft.price_min ?? ""}
                onChange={(e) => setValue("price_min", digitsOnly(e.target.value))}
                placeholder={t("rpZero")}
              />
              <Text variant="small" className="text-muted-foreground">
                0 = no limit
              </Text>
            </Box>
            <Box className="flex flex-col gap-1.5">
              <Label htmlFor="price-max">{t("upperLimit")}</Label>
              <Input
                id="price-max"
                inputMode="numeric"
                value={draft.price_max ?? ""}
                onChange={(e) => setValue("price_max", digitsOnly(e.target.value))}
                placeholder={t("rpZero")}
              />
              <Text variant="small" className="text-muted-foreground">
                0 = no limit
              </Text>
            </Box>
          </Box>

          {/* Loyalty points are decided here, with the price: this page is used
              mostly on pooled SKUs, which have no product yet to carry them.
              Promote copies them across, as it does the price window above. */}
          <Box className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4">
            <Box className="flex flex-col gap-1.5">
              <Label htmlFor="point-percent">{t("pointsPercent")}</Label>
              <Input
                id="point-percent"
                inputMode="decimal"
                value={draft.point_percent ?? ""}
                onChange={(e) => setValue("point_percent", decimalOnly(e.target.value))}
                placeholder={t("globalDefault")}
              />
              <Text variant="small" className="text-muted-foreground">
                Empty = use the global points setting · 0 = this SKU earns nothing
              </Text>
            </Box>
            <Box className="flex flex-col gap-1.5">
              <Label htmlFor="point-flat">{t("bonusPoints")}</Label>
              <Input
                id="point-flat"
                inputMode="numeric"
                value={draft.point_flat ?? ""}
                onChange={(e) => setValue("point_flat", digitsOnly(e.target.value))}
                placeholder={t("globalDefault")}
              />
              <Text variant="small" className="text-muted-foreground">
                Flat points added on top of the percentage
              </Text>
            </Box>
          </Box>

          {/* The day's selling allowance. A local quota, not the provider's
              stock: the provider reports no quantity at all and has no
              availability probe, so this is the operator's own ceiling on how
              many of this SKU may be sold today. */}
          <Box className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4">
            <Box className="flex flex-col gap-1.5">
              <Label htmlFor="daily-order-limit">{t("dailyOrderLimit")}</Label>
              <Input
                id="daily-order-limit"
                inputMode="numeric"
                value={draft.daily_order_limit ?? ""}
                onChange={(e) => setValue("daily_order_limit", digitsOnly(e.target.value))}
                placeholder={t("unlimited")}
              />
              <Text variant="small" className="text-muted-foreground">
                {t("dailyOrderLimitHint")}
              </Text>
            </Box>
          </Box>

          <Box className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={backToList}>
              Back to list
            </Button>
            <Button type="button" onClick={onSubmit} disabled={bulkMargin.isPending || ids.length === 0}>
              {bulkMargin.isPending ? "Saving…" : "Save"}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
