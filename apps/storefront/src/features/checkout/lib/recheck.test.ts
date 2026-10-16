import { describe, expect, it } from "vitest";

import { decideRecheck, recheckBlocksCheckout, recheckStatusFrom } from "./recheck";

describe("decideRecheck", () => {
  it("lets the buyer through when nothing moved", () => {
    expect(decideRecheck("ok", 12000, 12000)).toBe("proceed");
  });

  it("asks before charging more than was quoted", () => {
    expect(decideRecheck("price_changed", 12000, 15000)).toBe("confirm");
  });

  it("lets the buyer through when the price fell", () => {
    // Charging less than quoted has no unhappy outcome — a dialog here would be
    // a speed bump on good news.
    expect(decideRecheck("price_changed", 15000, 12000)).toBe("proceed");
  });

  it("lets the buyer through when the reprice left the selling price alone", () => {
    // Cost moved but the margin guard kept the selling price where it was.
    expect(decideRecheck("price_changed", 12000, 12000)).toBe("proceed");
  });

  it("blocks the sale when the provider switched the item off", () => {
    expect(decideRecheck("unavailable", 12000, 12000)).toBe("block");
  });

  it("offers a retry when the check could not trust what it holds", () => {
    expect(decideRecheck("unknown", 12000, 12000)).toBe("retry");
  });
});

describe("recheckStatusFrom", () => {
  it("renames price_changed to the screen's `changed`", () => {
    expect(recheckStatusFrom("price_changed")).toBe("changed");
  });

  it("passes the other three outcomes through", () => {
    expect(recheckStatusFrom("ok")).toBe("ok");
    expect(recheckStatusFrom("unavailable")).toBe("unavailable");
    expect(recheckStatusFrom("unknown")).toBe("unknown");
  });
});

describe("recheckBlocksCheckout", () => {
  it("holds the button while the question is out", () => {
    expect(recheckBlocksCheckout("checking")).toBe(true);
  });

  it("holds the button when the item is off sale or the answer is unknown", () => {
    expect(recheckBlocksCheckout("unavailable")).toBe(true);
    expect(recheckBlocksCheckout("unknown")).toBe(true);
  });

  it("lets an ordinary or an upward-repriced item press through", () => {
    // An upward move is answered by a dialog on press, not a dead button.
    expect(recheckBlocksCheckout("ok")).toBe(false);
    expect(recheckBlocksCheckout("changed")).toBe(false);
  });

  it("does not block before a package is chosen", () => {
    expect(recheckBlocksCheckout("idle")).toBe(false);
  });
});
