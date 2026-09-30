import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { renderRoute, screen } from "@/test/test-utils";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Real nested routes for the two Product tabs (product_requirements.md §4.6),
 * guarded by `requirePermission("products.view")` on the parent route only —
 * not client-side tab state, so the breadcrumb reflects the actual URL.
 */
describe("products routes", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: "test-token" });
  });

  afterEach(() => {
    useAuthStore.setState({ token: null });
  });

  it("redirects /admin/products to the Main Products tab for an authenticated admin", async () => {
    await renderRoute("/admin/products");
    expect(await screen.findByRole("heading", { name: "Main Products" })).toBeInTheDocument();
  });

  it("redirects /admin/products/main to /login when unauthenticated", async () => {
    useAuthStore.setState({ token: null });
    await renderRoute("/admin/products/main");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the tab links, without the retired Provider tab", async () => {
    await renderRoute("/admin/products");
    for (const label of ["Main Products", "Price Change Log"]) {
      expect(await screen.findByRole("tab", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("tab", { name: "Product Provider" })).not.toBeInTheDocument();
  });

  it("serves the Product Provider tab as the managed provider list", async () => {
    await renderRoute("/admin/products/provider");
    expect(await screen.findByRole("heading", { name: "Product Provider" })).toBeInTheDocument();
    expect(screen.queryByText(/waiting on a reference/i)).not.toBeInTheDocument();
    expect(await screen.findByPlaceholderText("Search provider product")).toBeInTheDocument();
  });

  it("serves Add Product Provider as its own page, with no tab bar", async () => {
    await renderRoute("/admin/products/provider/add");

    expect(await screen.findByRole("heading", { name: "Add Product Provider" })).toBeInTheDocument();
    // ProductTabsLayout hides the tabs for any /add route, so the page stands alone.
    expect(screen.queryByRole("tab", { name: "Main Products" })).not.toBeInTheDocument();
  });
});
