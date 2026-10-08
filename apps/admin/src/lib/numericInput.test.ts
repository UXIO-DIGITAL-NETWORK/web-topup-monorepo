import { describe, it, expect } from "vitest";

import { decimalOnly, digitsOnly } from "./numericInput";

describe("digitsOnly", () => {
  it("keeps only digits, dropping letters and separators", () => {
    expect(digitsOnly("12a3")).toBe("123");
    expect(digitsOnly("12.345,6")).toBe("123456");
    expect(digitsOnly("-7")).toBe("7");
    expect(digitsOnly("abc")).toBe("");
    expect(digitsOnly("")).toBe("");
  });
});

describe("decimalOnly", () => {
  it("keeps an optional leading minus, the digits, and a single point", () => {
    expect(decimalOnly("-12a.3.4")).toBe("-12.34");
    expect(decimalOnly("7.")).toBe("7.");
    expect(decimalOnly("abc")).toBe("");
    expect(decimalOnly("12.5")).toBe("12.5");
  });

  it("only honours a leading minus", () => {
    expect(decimalOnly("1-2")).toBe("12");
    expect(decimalOnly("-5")).toBe("-5");
  });
});
