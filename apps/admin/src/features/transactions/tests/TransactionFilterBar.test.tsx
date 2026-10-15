import { describe, it, expect, beforeEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { usersService } from "@/features/administration/services/administration.service";
import { renderRoute, screen, within } from "@/test/test-utils";
import { BUYER_ROLES } from "../data/select-options.data";
import { transactionsService } from "../services/transactions.service";

/**
 * The filter dropdowns used to be fixed lists of invented ids (`prod-19-diamond`,
 * user `1001`…), so picking one could only ever return nothing — and two of them
 * were not even sent. These pin what makes them real: the options come from the
 * endpoint that owns the rows, the search goes to the server, and the chosen id
 * travels as the parameter the API filters on.
 *
 * Each trigger is labelled by its field name (`Label htmlFor` → the button), so
 * that — not the placeholder — is the accessible name the queries use.
 */
describe("TransactionFilterBar data-backed filters", () => {
  beforeEach(() => {
    // The table defaults its date range to today, so the clock is pinned for the
    // same reason as the page suite. Only Date is faked; timers stay real so
    // user-event and the 300ms search debounce behave normally.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
  });

  const filterBar = () => screen.findByRole("region", { name: "Transaction Filters" });

  it("fills the User dropdown from the users endpoint and sends the picked id", async () => {
    const usersSpy = vi.spyOn(usersService, "list");
    const listSpy = vi.spyOn(transactionsService, "list");
    const user = userEvent.setup();

    await renderRoute("/admin/transaction-preview");
    const bar = await filterBar();
    listSpy.mockClear();

    await user.click(within(bar).getByRole("combobox", { name: "User" }));

    await vi.waitFor(() => expect(usersSpy).toHaveBeenCalled());
    // By role, not by text: the row renders the name and the email as separate
    // nodes, so a bare text query matches more than the one option.
    await user.click(await screen.findByRole("option", { name: /Sinta Dewi/ }));

    await vi.waitFor(() => expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: "2" })));
  });

  it("asks only for buyer accounts, never for staff", async () => {
    const usersSpy = vi.spyOn(usersService, "list");
    const user = userEvent.setup();

    await renderRoute("/admin/transaction-preview");
    const bar = await filterBar();

    await user.click(within(bar).getByRole("combobox", { name: "User" }));

    // "Developer", "Super Admin", "Internal Finance" and the Hub system account
    // all carry staff roles; none of them is ever the customer on an order.
    await vi.waitFor(() =>
      expect(usersSpy).toHaveBeenCalledWith(expect.objectContaining({ roles: BUYER_ROLES })),
    );
  });

  it("searches users on the server as the admin types", async () => {
    const usersSpy = vi.spyOn(usersService, "list");
    const user = userEvent.setup();

    await renderRoute("/admin/transaction-preview");
    const bar = await filterBar();

    await user.click(within(bar).getByRole("combobox", { name: "User" }));
    // A user past the first page still has to be findable, which is why the term
    // travels to the endpoint instead of filtering the loaded page.
    await user.type(screen.getByPlaceholderText(/search users/i), "sinta");

    await vi.waitFor(() => expect(usersSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "sinta" })));
  });

  it("offers the real member/guest split instead of the retired Invoice From", async () => {
    const listSpy = vi.spyOn(transactionsService, "list");
    const user = userEvent.setup();

    await renderRoute("/admin/transaction-preview");
    const bar = await filterBar();
    listSpy.mockClear();

    await user.click(within(bar).getByRole("combobox", { name: "Customer" }));
    // Radix also renders a hidden native <option> per entry, so the text query
    // would be ambiguous; the listbox option is the single real one.
    await user.click(await screen.findByRole("option", { name: "Guest" }));

    // `customer_type` had no parameter to reach before; website/mobile app/admin
    // never existed on the server at all.
    await vi.waitFor(() => expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ customerType: "guest" })));
  });
});
