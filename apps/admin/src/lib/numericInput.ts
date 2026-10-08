/**
 * Sanitizers for numeric text inputs. Wired into a controlled `<Input>`'s
 * `onChange`, they keep the field's value digit-only (or decimal) before it is
 * stored — so a letter can never reach the form's state, typed or pasted. This
 * is stricter than `type="number"`, which still lets `e`, `+` and `-` through.
 */

/** Whole numbers only — rupiah, points, quantities. Drops every non-digit. */
export const digitsOnly = (value: string): string => value.replace(/\D+/g, "");

/**
 * A decimal with an optional leading minus — margins and percentages, which the
 * API accepts down to -100. Keeps one leading `-` and at most one `.`, so
 * "1.2.3" becomes "1.23" and "-4a" becomes "-4".
 */
export function decimalOnly(value: string): string {
  const negative = value.trimStart().startsWith("-");
  const [head, ...rest] = value.replace(/[^0-9.]/g, "").split(".");
  const body = rest.length > 0 ? `${head}.${rest.join("")}` : head;
  return `${negative ? "-" : ""}${body}`;
}
