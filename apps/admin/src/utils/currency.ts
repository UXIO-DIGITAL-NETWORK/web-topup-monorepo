/**
 * Formats a number as Indonesian Rupiah, e.g. formatCurrency(15000) ->
 * "Rp 15.000". Intl.NumberFormat("id-ID") inserts a non-breaking space
 * (U+00A0) after "Rp" — normalized to a regular space for predictable
 * string equality in tests/snapshots.
 *
 * `fractionDigits` defaults to 0: whole rupiah is the admin's convention
 * (products, transactions, performance tables, reports). The Financial and
 * Dashboard stat cards deliberately show cents to mirror their reference
 * figures, so they pass `fractionDigits={2}`.
 */
export function formatCurrency(value: number, options?: { fractionDigits?: number }): string {
  // A value that is not a finite number renders as "-" rather than "RpNaN".
  // `Intl.NumberFormat` formats `undefined` happily, so a field the API stopped
  // sending — a renamed column, say — would otherwise reach the screen looking
  // like a price. An em dash is a visible absence.
  if (!Number.isFinite(value)) return "-";

  const fractionDigits = options?.fractionDigits ?? 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
    .format(value)
    .replace(/\u00A0/g, " ");
}
