import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { renderRoute, screen, within, makeUser } from "@/test/test-utils";
import { useAuthStore } from "@/store/useAuthStore";
import { formatCurrency } from "@/utils/currency";
import { STAT_CARDS } from "../data/stat-cards.data";
import { ACTIVITY_LOG } from "../data/activity-log.data";

/**
 * Part 4 — test cases (see product_requirements.md §4.1 + design_system.md §8/§11):
 *
 * - Navigating to /admin/dashboard as an authenticated operator resolves the real
 *   dashboard page (not the old template widgets).
 * - The welcome banner renders a heading greeting the operator by name.
 * - The 3 stat cards render their labels ("Credit", "Debit", "Today's Sales")
 *   and their formatted currency values.
 * - The Monthly Performance card renders its heading and a month selector
 *   control.
 * - The Pending Orders card renders its heading and the 4 human-readable
 *   labels mapped from the camelCase fixture keys.
 * - The Recent Log Activity card renders its heading and at least one
 *   activity entry's action text.
 * - The tabbed performance table renders all 3 tab labels and, for the
 *   default tab, the "Category" / "Total Transaction" / "Revenue" column
 *   headers.
 *
 * Seeds `useAuthStore` with a fake token before rendering since /admin/dashboard is
 * behind `requireAuth` (see `src/middlewares/authMiddleware.ts`) and there is
 * no unauthenticated preview route for this screen.
 */
const mockUser = makeUser();

describe("DashboardPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: "test-token", user: mockUser });
  });

  afterEach(() => {
    useAuthStore.setState({ token: null, user: null });
  });

  it("resolves /admin/dashboard for an authenticated operator", async () => {
    await renderRoute("/admin/dashboard");

    expect(screen.getByRole("heading", { name: /welcome/i })).toBeInTheDocument();
  });

  it("shows the welcome banner greeting the authenticated user by name", async () => {
    await renderRoute("/admin/dashboard");

    // The name now comes synchronously from the auth store's user (real login
    // response), not the retired operator fixture.
    expect(screen.getByRole("heading", { name: /welcome, dimas sufyan!/i })).toBeInTheDocument();
  });

  it("shows the 3 stat cards with their labels and formatted values", async () => {
    await renderRoute("/admin/dashboard");

    for (const card of STAT_CARDS) {
      expect(await screen.findByText(card.label)).toBeInTheDocument();
    }
    expect(
      (await screen.findAllByText(formatCurrency(STAT_CARDS[0].value, { fractionDigits: 2 }))).length,
    ).toBeGreaterThan(0);
  });

  it("shows the Monthly Performance card with a month selector", async () => {
    await renderRoute("/admin/dashboard");

    expect(await screen.findByRole("heading", { name: "Monthly Performance" })).toBeInTheDocument();
    // The performance table header also has a (decorative) "This Week" combobox, so
    // scope the query to the card's landmark region rather than the whole page.
    const region = screen.getByRole("region", { name: "Monthly Performance" });
    expect(within(region).getByRole("combobox")).toBeInTheDocument();
  });

  it("shows the Pending Orders card with the 4 human-readable labels", async () => {
    await renderRoute("/admin/dashboard");

    expect(screen.getByRole("heading", { name: "Pending Orders" })).toBeInTheDocument();
    expect(screen.getByText("Manual Orders")).toBeInTheDocument();
    expect(screen.getByText("Pending Payment")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("Failed Transaction")).toBeInTheDocument();
  });

  it("shows the Recent Log Activity card with at least one entry", async () => {
    await renderRoute("/admin/dashboard");

    expect(screen.getByRole("heading", { name: "Recent Log Activity" })).toBeInTheDocument();
    expect(await screen.findAllByText(ACTIVITY_LOG[0].action)).not.toHaveLength(0);
  });

  it("shows the tabbed performance table with all 3 tab labels", async () => {
    await renderRoute("/admin/dashboard");

    expect(screen.getByRole("tab", { name: "Category Performance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Product Performance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "User Performance" })).toBeInTheDocument();
  });

  it("shows the default tab's table with Category / Total Transaction / Revenue columns", async () => {
    await renderRoute("/admin/dashboard");

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Category" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Total Transaction" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Revenue" })).toBeInTheDocument();
  });
});
