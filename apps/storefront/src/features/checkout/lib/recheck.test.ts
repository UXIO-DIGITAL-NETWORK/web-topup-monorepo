import { describe, expect, it } from "vitest";

import { recheckBlocksCheckout, recheckPriceChange } from "./recheck";
import type { RecheckOutcome, RecheckResult } from "@/features/checkout/types/checkout.type";

const answer = (outcome: RecheckOutcome, previousPrice: number, price: number): RecheckResult => ({
  outcome,
  price,
  previous_price: previousPrice,
  available: outcome !== "unavailable",
  freshness: "fresh",
  checked_at: "2026-10-16T00:00:00+00:00",
});

describe("recheckBlocksCheckout", () => {
  it("lets the buyer through when nothing moved or the price moved", () => {
    expect(recheckBlocksCheckout("ok")).toBe(false);
    expect(recheckBlocksCheckout("price_changed")).toBe(false);
  });

  it("holds the order when the provider switched the item off", () => {
    expect(recheckBlocksCheckout("unavailable")).toBe(true);
  });

  it("holds the order when the check could not trust what it holds", () => {
    expect(recheckBlocksCheckout("unknown")).toBe(true);
  });

  it("holds the order when the request itself never got an answer", () => {
    // No answer is not the same as a good answer.
    expect(recheckBlocksCheckout(null)).toBe(true);
  });
});

describe("recheckPriceChange", () => {
  it("reads an increase off the API's own two numbers", () => {
    expect(recheckPriceChange(answer("price_changed", 12000, 15000))).toBe("higher");
  });

  it("reads a drop off the API's own two numbers", () => {
    expect(recheckPriceChange(answer("price_changed", 15000, 12000))).toBe("lower");
  });

  it("reports no change when the reprice left the selling price where it was", () => {
    // Cost moved, the margin guard kept the price — nothing to tell the buyer.
    expect(recheckPriceChange(answer("price_changed", 12000, 12000))).toBe("none");
  });

  it("reports no change for an ordinary answer", () => {
    expect(recheckPriceChange(answer("ok", 12000, 12000))).toBe("none");
  });

  it("reports no change when there was no answer at all", () => {
    expect(recheckPriceChange(null)).toBe("none");
  });
});
