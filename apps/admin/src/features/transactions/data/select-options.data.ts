import type { KeyedSelectOption } from "../types/transaction.type";

/**
 * Only the enumerated lists live here.
 *
 * Users, categories, products and payment channels are deliberately NOT in this
 * file: they were fixed lists of invented ids, so picking one could only ever
 * return nothing. Each is now a `SearchableSelect` fed by the endpoint that owns
 * the rows (`TransactionFilterComboboxes.tsx`).
 */

export const INVOICE_STATUS_OPTIONS: KeyedSelectOption[] = [
  { value: "pending", labelKey: "pillPending" },
  { value: "processing", labelKey: "pillProcessing" },
  { value: "success", labelKey: "optSuccess" },
  { value: "failed", labelKey: "pillFailed" },
  { value: "refunded", labelKey: "optRefunded" },
  { value: "partial_success", labelKey: "optPartialSuccess" },
];

/**
 * The gateway's own vocabulary, and deliberately NOT an alias of the invoice
 * options it used to be. A payment is never "processing" and never "partial" —
 * offering those could only ever produce an empty result.
 *
 * `none` is not a gateway state: it selects orders that never went through a
 * gateway at all, which is the whole population of the Manual tab and is
 * otherwise unreachable.
 */
export const PAYMENT_STATUS_OPTIONS: KeyedSelectOption[] = [
  { value: "pending", labelKey: "optUnpaid" },
  { value: "success", labelKey: "optPaid" },
  { value: "expired", labelKey: "badgeExpired" },
  { value: "refunded", labelKey: "optRefunded" },
  { value: "none", labelKey: "optNoGateway" },
];

/** The supplier's own vocabulary. Mirrors the Provider column exactly. */
export const PROVIDER_STATUS_OPTIONS: KeyedSelectOption[] = [
  { value: "not_ordered", labelKey: "optNotOrdered" },
  { value: "queued", labelKey: "optQueued" },
  { value: "sending", labelKey: "optSending" },
  { value: "ordered", labelKey: "optInProgress" },
  { value: "unconfirmed", labelKey: "optUnconfirmed" },
  { value: "delivered", labelKey: "badgeDelivered" },
  { value: "rejected", labelKey: "optRejected" },
  { value: "undelivered", labelKey: "optNoResponse" },
];

/**
 * What an admin may set by hand, as opposed to what they may filter by.
 *
 * `refunded` is filterable but not settable: the API rejects it on
 * `manual-review` because the status now asserts that money went back to the
 * customer. Refunds are created by the refund flow and completed on the Refunds
 * page — a dropdown must not be able to claim one that never happened.
 */
export const EDITABLE_INVOICE_STATUS_OPTIONS: KeyedSelectOption[] = INVOICE_STATUS_OPTIONS.filter(
  (option) => option.value !== "refunded",
);

/**
 * Who bought it. The transactions table has no `source` column, so this (and
 * `is_manual`, which the Automatic/Manual tabs already own) is the only "where
 * did this come from" fact there is.
 */
export const CUSTOMER_TYPE_OPTIONS: KeyedSelectOption[] = [
  { value: "member", labelKey: "optMember" },
  { value: "guest", labelKey: "optGuest" },
];
