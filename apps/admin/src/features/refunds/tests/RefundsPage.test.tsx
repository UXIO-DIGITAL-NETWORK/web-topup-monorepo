import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderRoute, screen, within } from "@/test/test-utils";
import { refundsService } from "../services/refunds.service";

/**
 * Test cases:
 *
 * - The preview route resolves the Refunds page with its header and subcopy.
 * - The four status pills render with their counts.
 * - The table shows a guest refund awaiting transfer and a member refund
 *   already credited, with the right payout column for each.
 * - A `balance` refund offers no work actions — it settled when it was opened.
 * - A guest refund's menu offers claim / complete / reject.
 * - "Mark as transferred" confirms with the amount and destination before the
 *   mutation fires.
 * - "Reject refund" requires a reason before the mutation fires.
 */
describe("RefundsPage", () => {
  const openRowMenu = async (refundNumber: string) => {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: `Actions for ${refundNumber}` }));
    return user;
  };

  it("resolves the preview route with the header and subcopy", async () => {
    await renderRoute("/admin/refunds-preview");

    expect(await screen.findByRole("heading", { name: "Refunds" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Money owed back to customers. A registered member is credited to their balance automatically; a guest is transferred by hand from here.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the status pills with their counts", async () => {
    await renderRoute("/admin/refunds-preview");

    const awaiting = await screen.findByRole("button", { name: /Awaiting account/ });
    expect(within(awaiting).getByText("2")).toBeInTheDocument();

    const ready = screen.getByRole("button", { name: /Ready to verify/ });
    expect(within(ready).getByText("1")).toBeInTheDocument();

    const completed = screen.getByRole("button", { name: /Completed/ });
    expect(within(completed).getByText("7")).toBeInTheDocument();
  });

  it("surfaces refunds past the 2x24 working-hour promise", async () => {
    // Late refunds are the one thing that should interrupt whatever the
    // operator came here to do, so they get their own line above the filters.
    await renderRoute("/admin/refunds-preview");

    expect(await screen.findByText(/past the 2x24 working-hour promise/)).toBeInTheDocument();
  });

  it("offers verify and reject-claim on a claimed balance refund", async () => {
    await renderRoute("/admin/refunds-preview");
    await screen.findByText("RFD-c1a2i3m4e5d6");

    const user = await openRowMenu("RFD-c1a2i3m4e5d6");

    // Verifying the account is the work; the bank-transfer verbs must not
    // appear on a refund that pays to balance.
    expect(await screen.findByRole("menuitem", { name: /Verify & credit balance/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Reject claim/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Mark as transferred/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /payout details/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /Verify & credit balance/ }));

    // The dialog leads with the identity comparison, because that — not the
    // amount — is what the admin is actually deciding.
    expect(await screen.findByText("Claiming account")).toBeInTheDocument();
    expect(screen.getByText(/Matched on/)).toBeInTheDocument();
  });

  it("renders both refund paths with the payout column each deserves", async () => {
    await renderRoute("/admin/refunds-preview");

    expect(await screen.findByText("RFD-a1b2c3d4e5f6")).toBeInTheDocument();
    expect(screen.getByText("INV-20260830-ABC123")).toBeInTheDocument();
    expect(screen.getByText("guest@example.com")).toBeInTheDocument();
    // The guest's account, so an admin can transfer without opening anything.
    expect(screen.getByText("Bank Central Asia (BCA)")).toBeInTheDocument();
    expect(screen.getByText("1234567890")).toBeInTheDocument();

    // The member's refund has nowhere to transfer to — it is already spent.
    expect(screen.getByText("RFD-f6e5d4c3b2a1")).toBeInTheDocument();
    expect(screen.getByText("Member balance")).toBeInTheDocument();
  });

  it("offers no transfer actions on a refund that already went to a balance", async () => {
    await renderRoute("/admin/refunds-preview");
    await openRowMenu("RFD-f6e5d4c3b2a1");

    expect(await screen.findByRole("menuitem", { name: /View details/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Claim for transfer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Mark as transferred/ })).not.toBeInTheDocument();
    // Nor can a settled refund be rejected.
    expect(screen.queryByRole("menuitem", { name: /Reject refund/ })).not.toBeInTheDocument();
  });

  it("offers the transfer workflow on a guest refund that is ready", async () => {
    await renderRoute("/admin/refunds-preview");
    await openRowMenu("RFD-a1b2c3d4e5f6");

    expect(await screen.findByRole("menuitem", { name: /Edit payout details/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Claim for transfer/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Mark as transferred/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Reject refund/ })).toBeInTheDocument();
  });

  it("confirms the amount and destination before completing a transfer", async () => {
    const complete = vi.spyOn(refundsService, "complete");

    await renderRoute("/admin/refunds-preview");
    const user = await openRowMenu("RFD-a1b2c3d4e5f6");
    await user.click(await screen.findByRole("menuitem", { name: /Mark as transferred/ }));

    const dialog = await screen.findByRole("dialog");
    // What the admin should be checking against their banking app.
    expect(within(dialog).getByText("Rp 12.000")).toBeInTheDocument();
    expect(within(dialog).getByText(/Bank Central Asia \(BCA\) · 1234567890 · Guest Customer/)).toBeInTheDocument();
    expect(complete).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Mark as transferred" }));
    expect(complete).toHaveBeenCalledWith("1", expect.objectContaining({ note: "" }));

    complete.mockRestore();
  });

  describe("when the list is empty", () => {
    const emptyPage = {
      data: [],
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, from: null, last_page: 1, path: "", per_page: 10, to: null, total: 0 },
    };

    it("shows the empty state instead of a bare sentence", async () => {
      const list = vi.spyOn(refundsService, "list").mockResolvedValue(emptyPage);

      await renderRoute("/admin/refunds-preview");

      expect(await screen.findByText("No refunds yet")).toBeInTheDocument();
      expect(screen.getByText("Refund requests will appear here once customers ask for one.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

      list.mockRestore();
    });

    it("offers to clear the filters when they are what emptied the list", async () => {
      const list = vi.spyOn(refundsService, "list").mockResolvedValue(emptyPage);

      await renderRoute("/admin/refunds-preview");
      const user = userEvent.setup();
      await user.type(await screen.findByLabelText("Search refunds"), "nope");

      expect(await screen.findByText("No matching refunds")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Clear filters" }));

      expect(await screen.findByText("No refunds yet")).toBeInTheDocument();
      expect(screen.getByLabelText("Search refunds")).toHaveValue("");

      list.mockRestore();
    });
  });

  it("requires a reason before a refund can be rejected", async () => {
    const reject = vi.spyOn(refundsService, "reject");

    await renderRoute("/admin/refunds-preview");
    const user = await openRowMenu("RFD-a1b2c3d4e5f6");
    await user.click(await screen.findByRole("menuitem", { name: /Reject refund/ }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Reject refund" }));

    expect(await within(dialog).findByText("A rejection reason is required")).toBeInTheDocument();
    expect(reject).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Reason"), "Duplicate claim");
    await user.click(within(dialog).getByRole("button", { name: "Reject refund" }));

    expect(reject).toHaveBeenCalledWith("1", "Duplicate claim");

    reject.mockRestore();
  });
});
