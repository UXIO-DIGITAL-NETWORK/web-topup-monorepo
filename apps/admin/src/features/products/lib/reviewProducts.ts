import { computeRolePrice } from "./computeRolePrice";
import type { MarginPlanOption, PricingRuleOption } from "../services/provider.service";
import type { MixProductOption } from "../components/MixProductPicker";

export type PriceSource = "margin" | "rule" | "cost";

/** One membership plan's resolved selling price for the review dialog. */
export interface ReviewPlanPrice {
  planValue: string;
  label: string;
  /** The margin the admin typed, or null when the plan falls back to the rules. */
  margin: number | null;
  price: number;
  source: PriceSource;
  /** The rule's markup percent, only when `source` is "rule". */
  rulePercent?: number;
}

/** A blocking error or a heads-up shown on a product's review card. */
export interface ReviewIssue {
  level: "block" | "warn";
  messageKey: string;
  params?: Record<string, unknown>;
}

export interface ReviewMixLine {
  name: string;
  code: string;
  quantity: number;
  cost: number;
}

/** Snapshot of the pool row taken when it was ticked — the row itself is gone once the page moves. */
export interface SelectedMeta {
  cost: number;
  providerName: string;
  mappedCategoryName: string;
}

/**
 * Everything the review dialog needs about one product. Built from the form the
 * admin filled, so the dialog stays presentational and the pricing numbers are
 * the SAME ones the page previews (one `resolvePlanPrice`).
 */
export interface ReviewItem {
  buyerSkuCode: string;
  providerName: string;
  name: string;
  subName: string;
  categoryName: string;
  subCategoryName: string;
  hasLogo: boolean;
  discountType: "" | "percent" | "fixed";
  discountValue: number | null;
  pointPercent: number | null;
  pointFlat: number | null;
  priceMin: number | null;
  priceMax: number | null;
  cost: number;
  mixCost: number;
  accumulated: number;
  mix: ReviewMixLine[];
  planPrices: ReviewPlanPrice[];
  defaultPlan?: ReviewPlanPrice;
  issues: ReviewIssue[];
  blocked: boolean;
}

/**
 * Selling price for one plan: a typed margin wins, otherwise the plan's pricing
 * rule, otherwise the product would sell at cost (flagged as an issue).
 */
export function resolvePlanPrice(
  accumulated: number,
  margin: number | null,
  rule?: PricingRuleOption,
): { price: number; source: PriceSource; rulePercent?: number } {
  if (margin !== null) return { price: computeRolePrice(accumulated, margin, 0), source: "margin" };
  if (rule) {
    return {
      price: computeRolePrice(accumulated, rule.markup_percent, rule.markup_flat),
      source: "rule",
      rulePercent: rule.markup_percent,
    };
  }
  return { price: accumulated, source: "cost" };
}

const toNumber = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/** The page's `RowForm` is structurally this — kept here so the lib imports no page. */
export interface ReviewFormInput {
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

export interface BuildReviewItemParams {
  buyerSkuCode: string;
  form: ReviewFormInput;
  meta?: SelectedMeta;
  plans: MarginPlanOption[];
  ruleForPlan: (planValue: string) => PricingRuleOption | undefined;
  planLabel: (plan: MarginPlanOption) => string;
  /** Resolved name of the category filter, when one is active. */
  categoryName?: string;
  /** Resolved label of the chosen sub-category. */
  subCategoryName?: string;
  mixOptions: MixProductOption[];
  currentMode: "single" | "bulk";
  /** Sub-category blocks only when the admin can actually choose one. */
  subCategoryRequired: boolean;
}

export function buildReviewItem({
  buyerSkuCode,
  form,
  meta,
  plans,
  ruleForPlan,
  planLabel,
  categoryName,
  subCategoryName,
  mixOptions,
  currentMode,
  subCategoryRequired,
}: BuildReviewItemParams): ReviewItem {
  const cost = meta?.cost ?? 0;

  // Mix is a Single-only composition; the page strips it in Bulk, so never show one here either.
  const mix: ReviewMixLine[] =
    currentMode === "single"
      ? form.mix
          .filter((line) => line.productId !== "")
          .map((line) => {
            const option = mixOptions.find((entry) => entry.id === line.productId);
            const quantity = Number(line.quantity) || 0;
            return {
              name: option?.name ?? line.productId,
              code: option?.code ?? "",
              quantity,
              cost: (option?.cost ?? 0) * quantity,
            };
          })
      : [];
  const mixCost = mix.reduce((sum, line) => sum + line.cost, 0);
  const accumulated = cost + mixCost;

  const planPrices: ReviewPlanPrice[] = plans.map((plan) => {
    const margin = toNumber(form.margins[plan.value] ?? "");
    const resolved = resolvePlanPrice(accumulated, margin, ruleForPlan(plan.value));
    return { planValue: plan.value, label: planLabel(plan), margin, ...resolved };
  });

  const defaultPlanOption = plans.find((plan) => plan.is_default) ?? plans[0];
  const defaultPlan = planPrices.find((plan) => plan.planValue === defaultPlanOption?.value);

  const issues: ReviewIssue[] = [];
  if (form.name.trim() === "") issues.push({ level: "block", messageKey: "issueName" });
  if (subCategoryRequired && form.subCategoryId === "") issues.push({ level: "block", messageKey: "issueSubCategory" });
  if (defaultPlan && defaultPlan.source === "cost") issues.push({ level: "block", messageKey: "issueDefaultPrice" });

  for (const plan of planPrices) {
    if (plan.planValue !== defaultPlan?.planValue && plan.source === "cost") {
      issues.push({ level: "warn", messageKey: "issueMarginNoRule", params: { plan: plan.label } });
    }
  }

  if (currentMode === "single" && form.mix.some((line) => line.productId === "")) {
    issues.push({ level: "warn", messageKey: "issueIncompleteMix" });
  }

  const discountValue = toNumber(form.discountValue);
  if (form.discountType !== "" && discountValue === null) issues.push({ level: "warn", messageKey: "issueDiscountValue" });
  if (form.discountType === "" && discountValue !== null) issues.push({ level: "warn", messageKey: "issueDiscountType" });
  if (form.logo === null) issues.push({ level: "warn", messageKey: "issueNoLogo" });

  return {
    buyerSkuCode,
    providerName: meta?.providerName ?? "",
    name: form.name,
    subName: form.subName,
    // The category the product actually lands in is the provider mapping's, not the filter's.
    categoryName: meta?.mappedCategoryName || categoryName || "",
    subCategoryName: subCategoryName ?? "",
    hasLogo: form.logo !== null,
    discountType: form.discountType,
    discountValue,
    pointPercent: toNumber(form.points),
    pointFlat: toNumber(form.pointsFlat),
    priceMin: toNumber(form.priceMin),
    priceMax: toNumber(form.priceMax),
    cost,
    mixCost,
    accumulated,
    mix,
    planPrices,
    defaultPlan,
    issues,
    blocked: issues.some((issue) => issue.level === "block"),
  };
}
