import { describe, it, expect } from "vitest";

import { normalizeProductCode } from "./productCode";

describe("normalizeProductCode", () => {
  it("turns a space into an underscore", () => {
    expect(normalizeProductCode("VIP 10")).toBe("VIP_10");
  });

  it("collapses a run of spaces into one underscore", () => {
    expect(normalizeProductCode("VIP  10")).toBe("VIP_10");
  });

  it("leaves a code that already has no space untouched", () => {
    expect(normalizeProductCode("MLBB_86")).toBe("MLBB_86");
  });
});
