/**
 * Product codes are used as display keys and must stay uniform, so a space an
 * admin types (or pastes) becomes an underscore the moment it lands. Runs of
 * whitespace collapse to one underscore — "VIP  10" reads as "VIP_10", not
 * "VIP__10".
 */
export function normalizeProductCode(value: string): string {
  return value.replace(/\s+/g, "_");
}
