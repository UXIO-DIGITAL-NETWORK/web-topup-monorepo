import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";

import { fireEvent, renderRoute, screen, within } from "@/test/test-utils";
import { TRANSACTIONS } from "../data/transactions.data";
import { transactionsService } from "../services/transactions.service";

/**
 * Part 4 — test cases (see product_requirements.md §4.3, revised 2026-07-10):
 *
 * - /admin/transaction-preview (unauthenticated preview route) resolves the
 *   Automatic Transaction History page: header + exact subcopy.
 * - The 3 status pills render with their exact labels and counts (12/32/8).
 * - The filter bar's 10 field labels are present.
 * - The table's 9 column headers are present.
 * - The exact-fidelity fixture row's key content renders (invoice no,
 *   customer name, product, game, formatted cost).
 * - Opening a row's action menu shows all 9 items, in order.
 * - "Refund" opens a confirmation dialog that requires a reason before the
 *   refund service fires (product_requirements.md §4.3).
 * - "Resend Receipt" is a distinct action from "View Invoice" and calls its
 *   own service (product_requirements.md §4.3).
 * - "Edit Invoice" NAVIGATES to the Edit Transaction page with its 4 fields
 *   (product_requirements.md §4.3, revised 2026-07-13 — was a modal).
 * - "Delete" opens a confirmation dialog BEFORE any delete mutation fires.
 *
 * Activity Log modal (product_requirements.md §4.3, confirmed 2026-07-13):
 * - "Activity Log" opens a dialog with the corrected subcopy, the 5 column
 *   headers, and that transaction's real fixture entries.
 * - Automated ("System") entries render distinctly from operator entries.
 */
describe("AutomaticTransactionsPage", () => {
  // The page defaults its date filter to today (commit 11e4238), so without a
  // pinned clock this suite silently depends on the real calendar — the
  // exact-fidelity Jul 1 fixture row drops out of every assertion below.
  // Only Date is faked; setTimeout/setInterval stay real so user-event and
  // React Query behave normally.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves /admin/transaction-preview with the header and exact subcopy", async () => {
    await renderRoute("/admin/transaction-preview");

    expect(await screen.findByRole("heading", { name: "Automatic Transaction History" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Monitor all automated transactions that have been processed along with their status and details.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the 4 status pills with exact labels and counts", async () => {
    await renderRoute("/admin/transaction-preview");

    // Pills are now full-width stat-card buttons with the label and count as
    // separate elements (matching the reference's visual layout), rather
    // than a single "Label (count)" text node — assert both are present
    // within each button rather than an exact accessible name.
    const pending = await screen.findByRole("button", { name: /Pending/ });
    expect(within(pending).getByText("12")).toBeInTheDocument();

    // The pills track the statuses the backend actually reports;
    // partial_refund / partial_success were never in its status enum.
    const processing = screen.getByRole("button", { name: /Processing/ });
    expect(within(processing).getByText("32")).toBeInTheDocument();

    // Added so an operator can see what actually landed, not only what is stuck.
    const success = screen.getByRole("button", { name: /Success/ });
    expect(within(success).getByText("45")).toBeInTheDocument();

    const failed = screen.getByRole("button", { name: /Failed/ });
    expect(within(failed).getByText("8")).toBeInTheDocument();
  });

  it("clicking a status card filters the list by that status, and clicking it again clears it", async () => {
    vi.setSystemTime(new Date("2026-07-05T12:00:00.000Z"));
    const listSpy = vi.spyOn(transactionsService, "list");
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    await screen.findByRole("table");
    listSpy.mockClear();

    // Held onto: once the filter applies, the Invoice Status select trigger
    // is a second button reading "Processing", so re-querying by name would
    // be ambiguous on the toggle-off click below.
    const card = await screen.findByRole("button", { name: /Processing/ });
    await user.click(card);

    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ invoiceStatus: "processing" }));
    // The card and the Invoice Status select drive the same filter state, so
    // the select must show the card's status rather than "All statuses".
    const filterBar = await screen.findByRole("region", { name: "Transaction Filters" });
    expect(await within(filterBar).findByText("Processing")).toBeInTheDocument();

    await user.click(card);
    expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ invoiceStatus: undefined }));
  });

  it("shows all 10 filter bar field labels", async () => {
    await renderRoute("/admin/transaction-preview");

    // Scoped to the filter bar's landmark: the sidebar also has an unrelated
    // "Search" trigger, so an unscoped query would match more than one node.
    const filterBar = await screen.findByRole("region", { name: "Transaction Filters" });
    for (const label of [
      "Search",
      "User",
      "Category",
      "Product",
      "Invoice Status",
      "Payment Status",
      "Start Date",
      "End Date",
      // Was "Invoice From": website / mobile app / admin never existed on the
      // server, so it now filters on the one real fact — member vs guest.
      "Customer",
      "Payment Method",
    ]) {
      expect(within(filterBar).getByText(label)).toBeInTheDocument();
    }
  });

  it("shows the table column headers", async () => {
    await renderRoute("/admin/transaction-preview");

    const table = await screen.findByRole("table");
    // "Status" is gone, replaced by the two lifecycles it used to stack
    // unlabelled: the gateway's verdict and the supplier's.
    for (const header of [
      "Invoice No.",
      "User",
      "Product",
      "Cost",
      "Target",
      "Payment",
      "Provider",
      "Method",
      "Time",
      "Action",
    ]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
  });

  it("shows the exact-fidelity row's key content", async () => {
    await renderRoute("/admin/transaction-preview");

    expect(await screen.findByText("ZP2607016UJFJVSHCJ")).toBeInTheDocument();
    expect((await screen.findAllByText("Randy Galang")).length).toBeGreaterThan(0);
    expect(screen.getByText("19 Diamond (17 + 2 Bonus)")).toBeInTheDocument();
    expect((await screen.findAllByText("Mobile Legends Indonesia")).length).toBeGreaterThan(0);
    expect(screen.getByText("Rp 4.752")).toBeInTheDocument();
    // The membership price list the figure was billed on. Absent on older
    // orders, which is why the fixture only tiers the first row.
    expect(screen.getByText("Member")).toBeInTheDocument();
  });

  it("opens a row's action menu with all 9 items, in order", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    const menuButton = await screen.findByRole("button", { name: /Actions for ZP2607016UJFJVSHCJ/i });
    await user.click(menuButton);

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Activity Log",
      "Resend Callback",
      "Retry Invoice",
      "View Invoice",
      "Resend Receipt",
      "Transaction Detail",
      "Edit Invoice",
      "Refund",
      "Delete",
    ]);
  });

  it("calls the resend-receipt service from the Resend Receipt menu item", async () => {
    const receiptSpy = vi.spyOn(transactionsService, "resendReceipt").mockResolvedValue();
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    const menuButton = await screen.findByRole("button", { name: /Actions for ZP2607016UJFJVSHCJ/i });
    await user.click(menuButton);
    await user.click(await screen.findByRole("menuitem", { name: "Resend Receipt" }));

    expect(receiptSpy).toHaveBeenCalledWith(expect.any(String));
  });

  it("exports the current filtered set from the Export button", async () => {
    const exportSpy = vi.spyOn(transactionsService, "exportTransactions").mockResolvedValue(new Blob());
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    await user.click(await screen.findByRole("button", { name: "Export" }));

    expect(exportSpy).toHaveBeenCalledTimes(1);
  });

  it("opens the Recap dialog and shows the breakdown from the recap service", async () => {
    vi.spyOn(transactionsService, "getRecap").mockResolvedValue({
      period: "daily",
      generated_at: "2026-07-01T00:00:00.000Z",
      rows: [{ label: "Mobile Legends", count: 3, revenue: 15000 }],
      totals: { count: 3, revenue: 15000 },
    });
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    await user.click(await screen.findByRole("button", { name: "Recap" }));

    const dialog = await screen.findByRole("dialog", { name: "Transaction Recap" });
    expect(await within(dialog).findByText("Mobile Legends")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Download CSV/ })).toBeEnabled();
  });

  it("opens a confirmation dialog before calling the refund service on Refund", async () => {
    const refundSpy = vi.spyOn(transactionsService, "refund");
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    const menuButton = await screen.findByRole("button", { name: /Actions for ZP2607016UJFJVSHCJ/i });
    await user.click(menuButton);
    await user.click(await screen.findByRole("menuitem", { name: "Refund" }));

    // The reason is mandatory, so submitting empty must surface the Zod error
    // and never reach the service.
    const dialog = await screen.findByRole("dialog", { name: /Refund transaction ZP2607016UJFJVSHCJ/ });
    await user.click(within(dialog).getByRole("button", { name: "Refund" }));
    expect(await within(dialog).findByText("A refund reason is required")).toBeInTheDocument();
    expect(refundSpy).not.toHaveBeenCalled();

    // With a reason, the service is called with the (mapped) row id and that
    // reason — the id here is the service's mapped id, not the raw fixture id.
    await user.type(within(dialog).getByLabelText("Reason"), "Item out of stock");
    await user.click(within(dialog).getByRole("button", { name: "Refund" }));
    expect(refundSpy).toHaveBeenCalledWith(expect.any(String), "Item out of stock");
  });

  it("navigates to the Edit Transaction page with its 4 fields on Edit Invoice", async () => {
    const user = userEvent.setup();
    const { router } = await renderRoute("/admin/transaction-preview");

    const menuButton = await screen.findByRole("button", { name: /Actions for ZP2607016UJFJVSHCJ/i });
    await user.click(menuButton);
    await user.click(await screen.findByRole("menuitem", { name: "Edit Invoice" }));

    // The row's own invoice drives the URL, and it's a real route now — the
    // list is gone from the DOM rather than sitting behind an overlay.
    expect(await screen.findByRole("heading", { name: "Edit Transaction" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/admin/transaction-preview/ZP2607016UJFJVSHCJ/edit");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    for (const label of ["Status Payment", "Invoice Status", "Serial Number", "Invoice Proof"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("opens the Activity Log dialog with its subcopy, 5 headers, and that row's real entries", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    const menuButton = await screen.findByRole("button", { name: /Actions for ZP2607016UJFJVSHCJ/i });
    await user.click(menuButton);
    await user.click(await screen.findByRole("menuitem", { name: "Activity Log" }));

    const dialog = await screen.findByRole("dialog", { name: "Activity Log" });
    expect(
      within(dialog).getByText("A record of every status change and action taken on this transaction."),
    ).toBeInTheDocument();

    // Scoped to the dialog: the parent table also has "User" and "Action"
    // column headers, so an unscoped query would match two nodes.
    for (const header of ["No.", "User", "Action", "Description", "Time"]) {
      expect(within(dialog).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }

    // Real logged content, not just "a table rendered". `activity_logs` stores
    // one human-readable sentence per entry, so the description is the payload
    // — there is no separate short action label to assert on.
    const log = TRANSACTIONS[0].activity_log;
    for (const entry of log) {
      expect(await within(dialog).findByText(entry.description)).toBeInTheDocument();
    }
  });

  it("shows the parent row's own customer in the User column, on every entry", async () => {
    // txn-2, dated Jul 2, so the clock moves a day forward BEFORE render —
    // the page seeds its date filter from `new Date()` in a useState
    // initializer. Its customer differs from txn-1's, which is the point:
    // the User column must follow the transaction the modal was opened from.
    vi.setSystemTime(new Date("2026-07-02T12:00:00.000Z"));
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    const transaction = TRANSACTIONS[1];
    const { name, phone } = transaction.customer;

    await user.click(
      await screen.findByRole("button", { name: new RegExp(`Actions for ${transaction.invoice_no}`, "i") }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Activity Log" }));

    const dialog = await screen.findByRole("dialog", { name: "Activity Log" });
    // One name + one phone per entry — never the other row's customer, and
    // never a "System" placeholder.
    // The trail is scoped by transaction_id, so it can only ever contain this
    // order's entries — the other row's customer must not appear.
    for (const entry of transaction.activity_log) {
      expect(await within(dialog).findByText(entry.description)).toBeInTheDocument();
    }
    expect(within(dialog).queryByText(TRANSACTIONS[0].activity_log[0].description)).not.toBeInTheDocument();
    void name;
    void phone;
  });

  it("opens a confirmation dialog before calling the delete service on Delete", async () => {
    const removeSpy = vi.spyOn(transactionsService, "remove");
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    const menuButton = await screen.findByRole("button", { name: /Actions for ZP2607016UJFJVSHCJ/i });
    await user.click(menuButton);
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("rejects an invalid Invoice Proof file and blocks Save (Zod file validation)", async () => {
    const editSpy = vi.spyOn(transactionsService, "edit");
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    const menuButton = await screen.findByRole("button", { name: /Actions for ZP2607016UJFJVSHCJ/i });
    await user.click(menuButton);
    await user.click(await screen.findByRole("menuitem", { name: "Edit Invoice" }));

    const fileInput = await screen.findByLabelText("Invoice Proof");
    const invalidFile = new File(["not-an-image"], "proof.pdf", { type: "application/pdf" });
    // fireEvent (not user-event) here: the file input is visually hidden
    // behind the "Browse files" button, and user-event's upload() no-ops on
    // it rather than setting `files` + firing change — same hidden-input
    // caveat already documented in FinancialPage.test.tsx for the clipboard
    // stub.
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Only JPG, JPEG, or PNG files are allowed")).toBeInTheDocument();
    expect(editSpy).not.toHaveBeenCalled();
  });

  it("selects all rows via the header checkbox, and a single row via its own checkbox", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    const selectAll = await screen.findByRole("checkbox", { name: "Select all rows" });
    const rowCheckboxes = await screen.findAllByRole("checkbox", { name: "Select row" });
    expect(rowCheckboxes.length).toBeGreaterThan(0);
    expect(rowCheckboxes[0]).not.toBeChecked();

    await user.click(rowCheckboxes[0]);
    expect(rowCheckboxes[0]).toBeChecked();

    // Cleared before exercising the header checkbox: the default date filter
    // narrows the page to a single day, and with one row still selected the
    // header is already in its all-checked state, so clicking it would
    // deselect rather than select.
    await user.click(rowCheckboxes[0]);
    expect(rowCheckboxes[0]).not.toBeChecked();

    await user.click(selectAll);
    for (const checkbox of rowCheckboxes) expect(checkbox).toBeChecked();
  });

  it("clicking a sortable column header re-queries the service with real sort params", async () => {
    const listSpy = vi.spyOn(transactionsService, "list");
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    await screen.findByText("ZP2607016UJFJVSHCJ");
    listSpy.mockClear();

    await user.click(await screen.findByRole("button", { name: "Cost" }));

    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ sortBy: "cost", sortDir: "asc" }));
  });

  it("shows a row number column instead of a drag handle", async () => {
    await renderRoute("/admin/transaction-preview");

    await screen.findByText("ZP2607016UJFJVSHCJ");
    expect(screen.getByRole("columnheader", { name: "#" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Drag to reorder row" })).not.toBeInTheDocument();
  });

  it("opens the Transaction Detail dialog for the row it was launched from", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    const transaction = TRANSACTIONS[0];
    await user.click(
      await screen.findByRole("button", { name: new RegExp(`Actions for ${transaction.invoice_no}`, "i") }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Transaction Detail" }));

    const dialog = await screen.findByRole("dialog", { name: "Transaction Detail" });
    expect(await within(dialog).findByText(transaction.invoice_no)).toBeInTheDocument();
    expect(within(dialog).getByText(transaction.game.name)).toBeInTheDocument();
    expect(within(dialog).getByText(transaction.product.name)).toBeInTheDocument();
  });

  // The dialog is mounted once per row, so it must show the row it was opened
  // from — not whichever one rendered first.
  it("shows the second row's own transaction when opened from that row", async () => {
    vi.setSystemTime(new Date("2026-07-02T12:00:00.000Z"));
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    const transaction = TRANSACTIONS[1];
    await user.click(
      await screen.findByRole("button", { name: new RegExp(`Actions for ${transaction.invoice_no}`, "i") }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Transaction Detail" }));

    const dialog = await screen.findByRole("dialog", { name: "Transaction Detail" });
    expect(await within(dialog).findByText(transaction.invoice_no)).toBeInTheDocument();
    expect(within(dialog).queryByText(TRANSACTIONS[0].invoice_no)).not.toBeInTheDocument();
  });

  // Pins `enabled: open`. Without it every visible row would fetch its own
  // detail on page load — 15 requests for a screen nobody has clicked yet.
  it("fetches no transaction detail until the menu item is clicked", async () => {
    const detailSpy = vi.spyOn(transactionsService, "getDetail");
    const user = userEvent.setup();
    await renderRoute("/admin/transaction-preview");

    await screen.findByText("ZP2607016UJFJVSHCJ");
    expect(detailSpy).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: /Actions for ZP2607016UJFJVSHCJ/i }));
    await user.click(await screen.findByRole("menuitem", { name: "Transaction Detail" }));

    await screen.findByRole("dialog", { name: "Transaction Detail" });
    expect(detailSpy).toHaveBeenCalled();
  });
});
