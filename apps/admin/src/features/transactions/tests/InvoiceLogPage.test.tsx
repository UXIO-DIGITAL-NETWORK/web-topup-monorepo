import { describe, it, expect, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { renderRoute, screen, within } from "@/test/test-utils";
import { useAuthStore } from "@/store/useAuthStore";
import { invoiceLogService } from "../services/invoiceLog.service";

/**
 * Invoice Log — the receipt-delivery trail served by fakeApi's `/v1/invoice-logs`
 * fixture. The page is read-only, so what is under test is that it renders the
 * three outcomes and that typing narrows the query through the service.
 */
describe("InvoiceLogPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: "test-token", permissions: ["*"] });
  });

  it("renders the header and the log table columns", async () => {
    await renderRoute("/admin/transaction-invoice-log");

    expect(await screen.findByRole("heading", { name: /invoice delivery log/i })).toBeInTheDocument();

    const table = await screen.findByRole("table");
    for (const header of ["Time", "Invoice No.", "Channel", "Recipient", "Status", "Reason"]) {
      expect(within(table).getByText(header)).toBeInTheDocument();
    }
  });

  it("shows every outcome — sent, failed, and skipped — with its reason", async () => {
    await renderRoute("/admin/transaction-invoice-log");

    // The failed email carries the gateway's own words; the skipped WhatsApp
    // carries why nothing was attempted.
    expect((await screen.findAllByText("smtp refused")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pembeli tidak punya nomor WhatsApp").length).toBeGreaterThan(0);
    expect(screen.getAllByText("guest@example.com").length).toBeGreaterThan(0);

    // A resend is marked as such rather than looking like the first attempt.
    expect(screen.getAllByText("Resend").length).toBeGreaterThan(0);
  });

  it("passes the typed search term to the service", async () => {
    const listSpy = vi.spyOn(invoiceLogService, "list");
    await renderRoute("/admin/transaction-invoice-log");

    await screen.findByRole("table");
    const search = screen.getByPlaceholderText(/invoice no/i);
    await userEvent.type(search, "INV-20260807");

    await vi.waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "INV-20260807" })),
    );
    listSpy.mockRestore();
  });
});
