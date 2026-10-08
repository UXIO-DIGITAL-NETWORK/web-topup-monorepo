import { describe, it, expect } from "vitest";

import type { MarginPlanOption } from "../services/provider.service";
import { buildReviewItem, type ReviewFormInput } from "./reviewProducts";

const plan: MarginPlanOption = { value: "1", label: "Basic", code: "basic", is_default: true };

const baseForm: ReviewFormInput = {
  name: "Valorant 120",
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
};

const makeItem = (form: Partial<ReviewFormInput> = {}, currentMode: "single" | "bulk" = "single") =>
  buildReviewItem({
    buyerSkuCode: "VAL120",
    form: { ...baseForm, ...form },
    meta: { cost: 15000, providerName: "Provider", mappedCategoryName: "Games" },
    plans: [plan],
    ruleForPlan: () => undefined,
    planLabel: (entry) => entry.label,
    mixOptions: [],
    currentMode,
    subCategoryRequired: false,
  });

describe("buildReviewItem — per-field status", () => {
  it("marks a filled field and leaves an optional empty one neutral", () => {
    const item = makeItem();
    expect(item.fields.name).toBe("filled");
    expect(item.fields.subName).toBe("optional");
    expect(item.fields.priceMin).toBe("optional");
  });

  it("marks a required field that is empty as missing", () => {
    expect(makeItem({ name: "   " }).fields.name).toBe("missing");
  });

  it("marks a typed number as filled", () => {
    expect(makeItem({ points: "10" }).fields.points).toBe("filled");
    expect(makeItem({ priceMin: "0" }).fields.priceMin).toBe("filled");
  });

  it("flags a discount type whose value is empty", () => {
    expect(makeItem({ discountType: "percent", discountValue: "" }).fields.discount).toBe("missing");
    expect(makeItem({ discountType: "percent", discountValue: "5" }).fields.discount).toBe("filled");
    expect(makeItem({ discountType: "" }).fields.discount).toBe("optional");
  });

  it("flags the default plan when it has neither a margin nor a rule", () => {
    expect(makeItem().fields.defaultPrice).toBe("missing");
    expect(makeItem({ margins: { "1": "20" } }).fields.defaultPrice).toBe("filled");
  });

  it("treats mix as optional in bulk, missing when a row is incomplete, filled otherwise", () => {
    expect(makeItem({}, "bulk").fields.mix).toBe("optional");
    expect(makeItem({ mix: [{ productId: "", quantity: "1" }] }).fields.mix).toBe("missing");
    expect(makeItem({ mix: [{ productId: "p1", quantity: "1" }] }).fields.mix).toBe("filled");
  });
});
