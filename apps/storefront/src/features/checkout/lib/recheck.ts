import type { RecheckOutcome, RecheckResult } from "@/features/checkout/types/checkout.type";

/**
 * Whether an answer lets this order go ahead.
 *
 * `null` is "we could not ask at all" — the request itself failed — and it is
 * treated exactly like `unknown`: neither is a number to sell on. Only `ok` and
 * `price_changed` let the buyer through, and both of them then show the price
 * the API says will actually be billed.
 */
export function recheckBlocksCheckout(outcome: RecheckOutcome | null): boolean {
  return outcome === null || outcome === "unavailable" || outcome === "unknown";
}

/** How the billed price now sits against what the buyer was quoted. */
export type RecheckPriceChange = "none" | "lower" | "higher";

/**
 * Read off the API's own two numbers rather than the ones this screen was
 * displaying: the check may have repriced the item server-side, so `previous_price`
 * is the only trustworthy record of what the buyer was quoted a moment ago.
 */
export function recheckPriceChange(result: RecheckResult | null): RecheckPriceChange {
  if (result === null || result.price === result.previous_price) return "none";

  return result.price > result.previous_price ? "higher" : "lower";
}
