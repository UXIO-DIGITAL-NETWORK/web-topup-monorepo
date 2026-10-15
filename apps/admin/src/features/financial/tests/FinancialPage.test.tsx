import { describe, it, expect } from "vitest";

import { fireEvent, renderRoute, screen } from "@/test/test-utils";
import { formatCurrency } from "@/utils/currency";
import i18n from "@/config/i18n";
import { summaryCardsFor } from "../data/summary-cards.data";
import { PAYMENT_GATEWAYS } from "../data/payment-gateways.data";
import { SUPPLIERS } from "../data/suppliers.data";

/**
 * Part 4 — test cases (see product_requirements.md §4.2):
 *
 * - /admin/finance-preview (unauthenticated preview route) resolves the Financial
 *   Summary page: header + the exact subcopy.
 * - The 3 stat cards render their labels and formatted currency values.
 * - The Payment Gateway section renders its heading + subcopy, and at least
 *   the "UxioPay" row with both "Saldo Aktif"/"Saldo Tertahan" labels.
 * - The Supplier section renders its heading + subcopy, and at least one
 *   supplier row.
 * - Clicking a balance amount copies the exact displayed string (incl. "Rp")
 *   to the clipboard.
 */
describe("FinancialPage", () => {
  it("resolves /admin/finance-preview with the header and subcopy", async () => {
    await renderRoute("/admin/finance-preview");

    expect(await screen.findByRole("heading", { name: "Financial Summary" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Monitor payment gateway credit, user debit, and supplier balances in real time. Click an amount to copy.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the 3 stat cards with their labels and formatted values", async () => {
    await renderRoute("/admin/finance-preview");

    const SUMMARY_CARDS = summaryCardsFor(i18n.getFixedT(null, "financial"));

    for (const card of SUMMARY_CARDS) {
      expect(await screen.findByText(card.label)).toBeInTheDocument();
    }
    expect(
      (await screen.findAllByText(formatCurrency(SUMMARY_CARDS[0].value, { fractionDigits: 2 }))).length,
    ).toBeGreaterThan(0);
  });

  it("shows the Payment Gateway section with the UxioPay row and both balance labels", async () => {
    await renderRoute("/admin/finance-preview");

    expect(await screen.findByRole("heading", { name: "Payment Gateway" })).toBeInTheDocument();
    expect(screen.getByText("Summary of balances on each payment gateway.")).toBeInTheDocument();

    const gateway = PAYMENT_GATEWAYS[0];
    expect(await screen.findByText(gateway.name)).toBeInTheDocument();
    expect(screen.getByText("Saldo Aktif")).toBeInTheDocument();
    expect(screen.getByText("Saldo Tertahan")).toBeInTheDocument();
  });

  it("shows the Supplier section with at least one supplier row", async () => {
    await renderRoute("/admin/finance-preview");

    expect(await screen.findByRole("heading", { name: "Supplier" })).toBeInTheDocument();
    expect(screen.getByText("Summary of the balances available with each supplier.")).toBeInTheDocument();
    expect(await screen.findByText(SUPPLIERS[0].name)).toBeInTheDocument();
  });

  it("copies the exact displayed amount when a balance is clicked", async () => {
    await renderRoute("/admin/finance-preview");

    const gateway = PAYMENT_GATEWAYS[0];
    // Fixtures always carry a figure; the null case is a supplier with no
    // balance integration and is covered by CopyableAmount itself.
    const formatted = formatCurrency(gateway.activeBalance ?? 0, { fractionDigits: 2 });
    // Every fixture balance is deliberately the same amount (Rp 15.231,89, per
    // the reference), so several copy buttons share this accessible name —
    // any of them copying the exact string is what's under test. fireEvent
    // (not user-event) here: user-event's setup() installs its own clipboard
    // stub, clobbering the navigator.clipboard.writeText spy from setup.ts.
    const [amountButton] = await screen.findAllByRole("button", { name: new RegExp(`copy.*${formatted}`, "i") });

    fireEvent.click(amountButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(formatted);
  });
});
