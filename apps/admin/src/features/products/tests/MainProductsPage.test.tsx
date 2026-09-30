import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";

import { renderRoute, screen, within } from "@/test/test-utils";
import { productsService } from "../services/products.service";

const LIST_PATH = "/admin/products-preview/main";

/**
 * Reachability + content for the Main Products list (product_requirements.md
 * §4.6). Rendered through the unauthenticated preview twin, like every other
 * feature's page tests.
 *
 * Several cases exist specifically to pin corrections to the reference — the
 * lorem-ipsum subcopy and the "of 9999999 transactions" footer. Both defect
 * classes were confirmed across five Category references before this one.
 */
describe("MainProductsPage", () => {
  it("shows a breadcrumb reflecting the active tab", async () => {
    await renderRoute(LIST_PATH);
    const breadcrumb = await screen.findByRole("navigation", { name: "breadcrumb" });
    expect(breadcrumb).toHaveTextContent(/Product.*Main Products/);
  });

  it("shows the header and a real subcopy, not the reference's placeholder", async () => {
    await renderRoute(LIST_PATH);
    expect(await screen.findByRole("heading", { name: "Main Products" })).toBeInTheDocument();
    expect(screen.queryByText(/lorem ipsum/i)).not.toBeInTheDocument();
  });

  it("shows the two remaining tabs, and no Provider tab", async () => {
    await renderRoute(LIST_PATH);

    expect(await screen.findByRole("tab", { name: "Main Products" })).toBeInTheDocument();
    const priceLogTab = await screen.findByRole("tab", { name: "Price Change Log" });
    // The preview base is still honoured for the tab that remains.
    expect(priceLogTab).toHaveAttribute("href", "/admin/products-preview/price-log");

    // The pool's tab is gone: picking from a provider happens on this list now.
    expect(screen.queryByRole("tab", { name: "Product Provider" })).not.toBeInTheDocument();
  });

  it("shows the toolbar: search, category filter, price filter, refresh and Add", async () => {
    await renderRoute(LIST_PATH);

    expect(await screen.findByPlaceholderText("Search product name")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText("Price")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Main Products/i })).toBeInTheDocument();
  });

  it("'+ Add Main Products' opens a menu offering From Supplier, Manual and Bulk", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await user.click(await screen.findByRole("button", { name: /Add Main Products/i }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["From Supplier", "Manual", "Bulk"]);
  });

  it("the Add menu's From Supplier entry opens the provider picker", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await user.click(await screen.findByRole("button", { name: /Add Main Products/i }));
    await user.click(await screen.findByRole("menuitem", { name: "From Supplier" }));

    expect(await screen.findByRole("dialog", { name: "Add products from supplier" })).toBeInTheDocument();
  });

  it("the Add menu's Manual entry opens the Add Main Products modal", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await user.click(await screen.findByRole("button", { name: /Add Main Products/i }));
    await user.click(await screen.findByRole("menuitem", { name: "Manual" }));

    expect(await screen.findByRole("dialog", { name: "Add Main Products" })).toBeInTheDocument();
  });

  it("shows the column headers", async () => {
    await renderRoute(LIST_PATH);
    const table = await screen.findByRole("table");

    for (const header of ["No.", "Product", "Variant", "Price", "Created At", "Status", "Action"]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    // The column holds the price breakdown now, not the game name.
    expect(within(table).queryByRole("columnheader", { name: "Game" })).not.toBeInTheDocument();
  });

  it("shows real top-up rows, not the shadcn demo dataset", async () => {
    await renderRoute(LIST_PATH);

    expect(await screen.findByText("Weekly Diamond Pass (One Week)")).toBeInTheDocument();
    expect(screen.getByText("MLBB-WDP-01")).toBeInTheDocument();
    expect(screen.getAllByText("Mobile Legends: Indonesia").length).toBeGreaterThan(0);

    for (const term of ["Cover Page", "Executive Summary", "Jamik Tashpulatov"]) {
      expect(screen.queryByText(term)).not.toBeInTheDocument();
    }
  });

  it("renders the variant price as currency", async () => {
    await renderRoute(LIST_PATH);
    expect((await screen.findAllByText("Rp 27.788")).length).toBeGreaterThan(0);
  });

  it("breaks each variant's price down by membership plan, with margin and markup percent", async () => {
    await renderRoute(LIST_PATH);
    const table = await screen.findByRole("table");

    // One row per membership plan, not four frozen tiers: the API stopped
    // sending `price_vip`/`price_reseller`/`price_agent` when pricing moved to
    // plans, which is what rendered a dash and NaN% below the retail row.
    for (const label of ["Cost", "Basic", "Platinum", "Gold"]) {
      expect((await within(table).findAllByText(label)).length).toBeGreaterThan(0);
    }
    // prod-1-var-1: cost Rp 25.970 -> public Rp 27.788, so Rp 1.818 — 7.0% of
    // cost, the markup an admin types, not the 6.5% share of the selling price.
    expect(within(table).getAllByText("Rp 25.970").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Rp 1.818").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("7.0%").length).toBeGreaterThan(0);
  });

  // Lifecycle and provider availability are separate axes: a Published product
  // whose SKU the provider just switched off is Published + Unavailable, and
  // collapsing them into one badge would hide which half needs attention.
  it("stacks both status axes as separate badges", async () => {
    await renderRoute(LIST_PATH);
    const table = await screen.findByRole("table");

    expect(await within(table).findAllByText("Published")).not.toHaveLength(0);
    expect(within(table).getAllByText("Available").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Draft").length).toBeGreaterThan(0);
  });

  it("counts the footer in products, not transactions", async () => {
    await renderRoute(LIST_PATH);
    expect(await screen.findByText(/of \d+ products/)).toBeInTheDocument();
    expect(screen.queryByText(/transactions/)).not.toBeInTheDocument();
    expect(screen.queryByText(/9999999/)).not.toBeInTheDocument();
  });

  it("labels the page-size trigger the way the reference does", async () => {
    await renderRoute(LIST_PATH);
    expect(await screen.findByRole("combobox", { name: "Rows per page" })).toHaveTextContent("10 Row");
  });

  it("paginates: 12 fixtures over a default page size of 10 means a second page", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    expect(await screen.findByText("Weekly Diamond Pass (One Week)")).toBeInTheDocument();
    expect(screen.queryByText("Oneiric Shard 60")).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "2" }));

    expect(await screen.findByText("Oneiric Shard 60")).toBeInTheDocument();
    expect(screen.queryByText("Weekly Diamond Pass (One Week)")).not.toBeInTheDocument();
  });

  it("narrows the table when a search term is typed", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    expect(await screen.findByText("Weekly Diamond Pass (One Week)")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search product name"), "valorant");

    expect(await screen.findByText("Valorant Point 475")).toBeInTheDocument();
    expect(screen.queryByText("Weekly Diamond Pass (One Week)")).not.toBeInTheDocument();
  });

  // Slot order, not label wording: the two reversible items name whichever
  // direction would change this row, and this row is active and visible. Their
  // both-ways labelling is covered in MainProductRowActions.
  it("a row's action menu lists every action in the reference's order", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await user.click(await screen.findByRole("button", { name: /Actions for Weekly Diamond Pass \(One Week\)/i }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Uxiotopup Update",
      "Hide Price",
      "Set Price Limit",
      "Unpublish",
      "Edit Product",
    ]);
  });

  it("offers the real categories, not a hardcoded list", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await user.click(await screen.findByLabelText("Category"));

    // Names as the Category tab actually stores them. The old hardcoded list said
    // "Mobile Legends: Indonesia" and "Free Fire Indonesia" — neither exists.
    expect(await screen.findByRole("option", { name: "Mobile Legends" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Free Fire" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Free Fire Indonesia" })).not.toBeInTheDocument();
  });

  it("filters by category id, and leaves the search term alone", async () => {
    const listSpy = vi.spyOn(productsService, "list");
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await user.type(await screen.findByPlaceholderText("Search product name"), "diamond");
    await user.click(screen.getByLabelText("Category"));
    await user.click(await screen.findByRole("option", { name: "Mobile Legends" }));

    await waitFor(() => {
      const params = listSpy.mock.calls.at(-1)?.[0];
      // The category used to be sent as `search`, spread last — which both failed
      // to filter and wiped out whatever had been typed.
      expect(params).toMatchObject({ category_id: expect.stringMatching(/^\d+$/), search: "diamond" });
    });
  });
});
