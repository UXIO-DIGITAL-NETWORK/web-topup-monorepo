import { describe, it, expect } from "vitest";
import { formatCurrency } from "./currency";

describe("formatCurrency", () => {
  it("formats a number as whole Indonesian Rupiah by default", () => {
    expect(formatCurrency(15000)).toBe("Rp 15.000");
    expect(formatCurrency(1500000)).toBe("Rp 1.500.000");
  });

  it("rounds to the nearest rupiah by default", () => {
    expect(formatCurrency(15231.89)).toBe("Rp 15.232");
  });

  it("keeps cents when a caller asks for them", () => {
    expect(formatCurrency(15231.89, { fractionDigits: 2 })).toBe("Rp 15.231,89");
  });

  it("formats zero without trailing decimals", () => {
    expect(formatCurrency(0)).toBe("Rp 0");
  });
});

describe("a value that is not a number", () => {
  it("renders an absence rather than RpNaN", () => {
    expect(formatCurrency(Number.NaN)).toBe("-");
    expect(formatCurrency(undefined as unknown as number)).toBe("-");
  });
});
