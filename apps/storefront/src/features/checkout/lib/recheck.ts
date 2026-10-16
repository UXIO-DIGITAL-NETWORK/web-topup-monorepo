import type { RecheckOutcome } from "@/features/checkout/types/checkout.type";

/**
 * What the checkout screen does with the answer.
 *
 * - `proceed` the price is unchanged or moved in the buyer's favour — let them on
 * - `confirm` the price went up; a human has to say yes to the new number
 * - `block`   the item is off sale — nobody can buy it until it is fixed
 * - `retry`   we could not look and what we hold is too old to quote — offer
 *             "try again" rather than let the sale ride on a number we do not
 *             trust
 */
export type RecheckDecision = "proceed" | "confirm" | "block" | "retry";

/**
 * The rule, in one place, decided from the API's answer alone.
 *
 * A price that moved down is not worth a dialog — charging less than quoted has
 * no unhappy outcome, so it proceeds exactly like an unchanged one. Only an
 * increase stops the buyer, and only upward movement is what "increase" means
 * here: `previousPrice` and `newPrice` are the two prices the API itself
 * resolved, not the ones this screen is displaying.
 */
export function decideRecheck(
  outcome: RecheckOutcome,
  previousPrice: number,
  newPrice: number,
): RecheckDecision {
  switch (outcome) {
    case "unavailable":
      return "block";
    case "unknown":
      return "retry";
    case "price_changed":
      return newPrice > previousPrice ? "confirm" : "proceed";
    default:
      return "proceed";
  }
}

/**
 * The button's state, derived from the same answer. Named apart from
 * `RecheckOutcome` because the screen has states the answer does not: `idle`
 * (no package picked) and `checking` (the question is out).
 */
export type RecheckStatus =
  | "idle"
  | "checking"
  | "ok"
  | "changed"
  | "unavailable"
  | "unknown";

export function recheckStatusFrom(outcome: RecheckOutcome): RecheckStatus {
  return outcome === "price_changed" ? "changed" : outcome;
}

/**
 * Whether an answer lets the buyer press the button at all. `changed` is not
 * here on purpose: an upward move is answered by a dialog when they press, not
 * by a dead button.
 */
export function recheckBlocksCheckout(status: RecheckStatus): boolean {
  return status === "checking" || status === "unavailable" || status === "unknown";
}
