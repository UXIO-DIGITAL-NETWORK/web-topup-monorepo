import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { renderRoute, screen } from "@/test/test-utils";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Part 4 — test cases (see system_architecture.md §4.2/§5):
 *
 * - /admin/transactions redirects to /admin/transactions/automatic for an authenticated
 *   admin, resolving the Automatic table content.
 * - /admin/transactions/automatic redirects to /login when unauthenticated (auth
 *   still enforced on top of the feature's own permission gate).
 * - Both "Automatic"/"Manual" tab links are present on the automatic view.
 * - The nested edit route resolves under BOTH tabs for an authenticated
 *   admin (product_requirements.md §4.3, revised 2026-07-13) — RowActionMenu
 *   is shared, so Manual needs the mirror or its "Edit Invoice" 404s.
 * - The tabs are hidden on the edit sub-route.
 */
describe("transactions routes", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: "test-token" });
  });

  afterEach(() => {
    useAuthStore.setState({ token: null });
  });

  it("redirects /admin/transactions to the Automatic tab for an authenticated admin", async () => {
    await renderRoute("/admin/transactions");

    expect(await screen.findByRole("heading", { name: "Automatic Transaction History" })).toBeInTheDocument();
  });

  it("redirects /admin/transactions/automatic to /login when unauthenticated", async () => {
    useAuthStore.setState({ token: null });

    await renderRoute("/admin/transactions/automatic");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows both Automatic and Manual tab links", async () => {
    await renderRoute("/admin/transactions");

    expect(await screen.findByRole("tab", { name: "Automatic" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Manual" })).toBeInTheDocument();
  });

  it("resolves the nested edit route under the Automatic tab", async () => {
    await renderRoute("/admin/transactions/automatic/ZP2607016UJFJVSHCJ/edit");

    expect(await screen.findByRole("heading", { name: "Edit Transaction" })).toBeInTheDocument();
  });

  it("resolves the nested edit route under the Manual tab too", async () => {
    await renderRoute("/admin/transactions/manual/ZP2607016UJFJVSHCJ/edit");

    expect(await screen.findByRole("heading", { name: "Edit Transaction" })).toBeInTheDocument();
  });

  it("shows Refunds as a tab and resolves its page under Transactions", async () => {
    await renderRoute("/admin/transactions/refunds");

    expect(await screen.findByRole("heading", { name: "Refunds" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Refunds" })).toHaveAttribute("data-state", "active");
  });

  it("redirects the old /admin/refunds URL into the Refunds tab", async () => {
    await renderRoute("/admin/refunds");

    expect(await screen.findByRole("tab", { name: "Refunds" })).toHaveAttribute("data-state", "active");
  });

  it("keeps Invoice Log out of the tab strip", async () => {
    await renderRoute("/admin/transactions");

    await screen.findByRole("tab", { name: "Automatic" });
    expect(screen.queryByRole("tab", { name: "Invoice Log" })).not.toBeInTheDocument();
  });

  it("serves Invoice Log from its own route, without the Transactions tabs", async () => {
    await renderRoute("/admin/invoice-log");

    expect(await screen.findByRole("heading", { name: /invoice delivery log/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Automatic" })).not.toBeInTheDocument();
  });

  it("redirects the old /admin/transactions/invoice-log URL to the new one", async () => {
    await renderRoute("/admin/transactions/invoice-log");

    expect(await screen.findByRole("heading", { name: /invoice delivery log/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Automatic" })).not.toBeInTheDocument();
  });

  it("hides the Automatic/Manual tabs on the edit sub-route", async () => {
    await renderRoute("/admin/transactions/automatic/ZP2607016UJFJVSHCJ/edit");

    await screen.findByRole("heading", { name: "Edit Transaction" });
    expect(screen.queryByRole("tab", { name: "Automatic" })).not.toBeInTheDocument();
  });
});
