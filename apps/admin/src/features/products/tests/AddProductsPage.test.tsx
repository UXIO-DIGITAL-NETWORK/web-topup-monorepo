import { describe, it, expect, vi, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderRoute, screen, waitFor, within } from "@/test/test-utils";
import { productsService } from "../services/products.service";

const LIST_PATH = "/admin/products-preview/main";
const ADD_PATH = "/admin/products-preview/main/add";
const NOT_ADDED = "Valorant 120 Points";

/** The add flow is a page now, not a dialog. */
async function openPage(path: string = ADD_PATH) {
  await renderRoute(path);
  return screen.findByRole("heading", { name: "Add products" });
}

const rowOf = (code: string) => screen.getByText(code).closest("tr") as HTMLElement;

/** True when `a`'s row is rendered above `b`'s in the document. */
const appearsBefore = (a: string, b: string) =>
  Boolean(screen.getByText(a).compareDocumentPosition(screen.getByText(b)) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("AddProductsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens from the toolbar menu and navigates to its own page", async () => {
    const user = userEvent.setup();
    const { router } = await renderRoute(LIST_PATH);

    await user.click(await screen.findByRole("button", { name: /Add Main Products/i }));
    await user.click(await screen.findByRole("menuitem", { name: "Single" }));

    expect(await screen.findByRole("heading", { name: "Add products" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/admin/products-preview/main/add");
    expect(router.state.location.search).toMatchObject({ mode: "single" });
  });

  it("opens with both modes, the two filters, and an empty count", async () => {
    await openPage();

    expect(screen.getByRole("button", { name: "Single" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bulk" })).toBeInTheDocument();
    // Provider and category, the pair the reference puts above the table.
    expect(screen.getByLabelText("Supplier")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as draft (0)" })).toBeInTheDocument();
  });

  /**
   * The redesigned flow: a product's fields are grouped into numbered steps,
   * each with a visible title and an info tooltip — the guide the admin asked
   * for. Selecting a row in Single opens them straight away.
   */
  it("groups each product's fields into numbered steps", async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));

    expect(screen.getByRole("button", { name: /Product Data/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pricing & Margin/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Price Limits/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Product Mix/ })).toBeInTheDocument();

    // Step 1 is open by default and carries its titled fields.
    expect(screen.getByLabelText("VAL120 name")).toBeInTheDocument();
    expect(screen.getByText("Points (%)")).toBeInTheDocument();
    expect(screen.getByText("Bonus Points")).toBeInTheDocument();
    expect(screen.getByText("Discount value")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "More information" }).length).toBeGreaterThan(0);
  });

  it("lists the provider services, paginated", async () => {
    await openPage();

    // The SKU is the row's identifier; the provider's own name sits under it.
    expect(await screen.findByText("VAL120")).toBeInTheDocument();
    expect(screen.getByText(NOT_ADDED)).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });

  /** "Kalau dia udah ada di data kita itu enggak bisa double." */
  it("refuses to select a service that is already a product", async () => {
    await openPage();

    const checkbox = await screen.findByRole("checkbox", { name: "Select ML86" });

    expect(checkbox).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save as draft (0)" })).toBeInTheDocument();
  });

  it("single mode keeps exactly one product selected", async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    expect(screen.getByRole("button", { name: "Save as draft (1)" })).toBeInTheDocument();

    // Ticking a second one REPLACES the first, rather than refusing the click.
    await user.click(await screen.findByRole("checkbox", { name: "Select VAL420" }));
    expect(screen.getByRole("button", { name: "Save as draft (1)" })).toBeInTheDocument();
  });

  it("bulk mode accumulates the selection", async () => {
    const user = userEvent.setup();
    await openPage(`${ADD_PATH}?mode=bulk`);

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select VAL420" }));

    expect(screen.getByRole("button", { name: "Save as draft (2)" })).toBeInTheDocument();
  });

  /** Mix is a Single-only decision — too much to fill in for a bulk selection. */
  it("offers product mix in Single mode", async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    await user.click(screen.getByRole("button", { name: /Product Mix/ }));

    expect(screen.getByRole("button", { name: /Add Mix/ })).toBeInTheDocument();
  });

  /** Ticking the box is the guide: the steps open on their own, in every mode. */
  it("opens a row's steps as soon as its checkbox is ticked, in Bulk too", async () => {
    const user = userEvent.setup();
    await openPage(`${ADD_PATH}?mode=bulk`);

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));

    // The row is VAL120's, and its steps are already open — no Configure click.
    expect(within(rowOf("VAL120")).getByRole("button", { name: "Configure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Product Data/ })).toBeInTheDocument();
  });

  it("hides product mix in Bulk mode", async () => {
    const user = userEvent.setup();
    await openPage(`${ADD_PATH}?mode=bulk`);

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    // The checkbox already opened the steps; go straight to Product Mix.
    await user.click(screen.getByRole("button", { name: /Product Mix/ }));

    expect(screen.queryByRole("button", { name: /Add Mix/ })).not.toBeInTheDocument();
    expect(screen.getByText("Product mix is only available in Single mode.")).toBeInTheDocument();
  });

  /**
   * The price headers share one server sort: cost asc → cost desc → provider
   * order. The fixture feeds ML86 (20.000), VAL120 (15.000) and VAL420 (50.000).
   */
  it("sorts the services by cost, lowest then highest", async () => {
    const user = userEvent.setup();
    await openPage();

    await screen.findByText("VAL120");

    await user.click(screen.getByRole("button", { name: "Cost: Sort by price" }));
    await waitFor(() => {
      expect(appearsBefore("VAL120", "ML86")).toBe(true);
      expect(appearsBefore("ML86", "VAL420")).toBe(true);
    });

    // Both price headers carry the shared state.
    expect(screen.getByRole("button", { name: "Sell Price: Lowest price first" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cost: Lowest price first" }));
    await waitFor(() => {
      expect(appearsBefore("VAL420", "ML86")).toBe(true);
      expect(appearsBefore("ML86", "VAL120")).toBe(true);
    });
  });

  it("shows numbered pagination with the current page marked", async () => {
    await openPage();

    const current = await screen.findByRole("link", { name: "1" });
    expect(current).toHaveAttribute("aria-current", "page");
  });

  /**
   * The price is a RESULT of the margin, shown in the row — the reference's
   * whole point, and the reason there is no price input.
   */
  it("shows the price the typed margin produces", async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    await user.click(screen.getByRole("button", { name: /Pricing & Margin/ }));

    const margin = screen.getAllByLabelText(/VAL120 .* margin/)[0];
    await user.type(margin, "50");

    // Cost is 15.000; a 50% margin sells at 22.500 (no rule produces this).
    expect(screen.getAllByText("Rp 22.500").length).toBeGreaterThan(0);
  });

  /** An empty margin is "follow the pricing rules", so the rule price shows. */
  it("follows the pricing rules when a margin is left empty", async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    await user.click(screen.getByRole("button", { name: /Pricing & Margin/ }));

    // Cost 15.000: the default plan's own rule (25%) → 18.750, and the plans
    // with no rule of their own fall back to the global 20% → 18.000.
    expect(screen.getAllByText("Rp 18.750").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rp 18.000").length).toBeGreaterThan(0);
  });

  /** 10k main + 5k mix must read as 15k, and the preview must use it. */
  it("adds a mix component's cost to the accumulated modal", async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    await user.click(screen.getByRole("button", { name: /Product Mix/ }));
    await user.click(screen.getByRole("button", { name: /Add Mix/ }));

    await user.click(screen.getByRole("combobox", { name: "VAL120 mix 1 product" }));
    await user.click(await screen.findByText(/Weekly Diamond Pass \(One Week\)/));

    // Main 15.000 + component 25.970 = 40.970, both in the row and the breakdown.
    expect(screen.getAllByText("Rp 40.970").length).toBeGreaterThan(0);
    expect(screen.getByText("Rp 15.000 + Rp 25.970")).toBeInTheDocument();
  });

  it("saves as a draft when asked, and publishes when asked", async () => {
    const spy = vi
      .spyOn(productsService, "addFromSupplier")
      .mockResolvedValue({ created: 1, published: 0, skipped: [] });
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    await user.click(screen.getByRole("button", { name: "Save as draft (1)" }));

    // The review step comes first — nothing reaches the API until it is confirmed.
    const dialog = await screen.findByRole("dialog", { name: "Review before saving" });
    expect(spy).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Yes, save as draft" }));

    expect(spy.mock.calls[0][0].publish).toBe(false);
    expect(spy.mock.calls[0][0].items[0].buyer_sku_code).toBe("VAL120");
  });

  it("sends the data typed in the row with the product", async () => {
    const spy = vi
      .spyOn(productsService, "addFromSupplier")
      .mockResolvedValue({ created: 1, published: 1, skipped: [] });
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));

    const nameField = screen.getByLabelText("VAL120 name");
    await user.clear(nameField);
    await user.type(nameField, "Valorant 120 Spesial");

    await user.click(screen.getByRole("button", { name: "Publish (1)" }));

    const dialog = await screen.findByRole("dialog", { name: "Review before publishing" });
    await user.click(within(dialog).getByRole("button", { name: "Yes, publish now" }));

    const payload = spy.mock.calls[0][0];
    expect(payload.publish).toBe(true);
    expect(payload.items[0].name).toBe("Valorant 120 Spesial");
  });

  it("shows each product's details in the review dialog before saving", async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    await user.click(screen.getByRole("button", { name: "Save as draft (1)" }));

    const dialog = await screen.findByRole("dialog", { name: "Review before saving" });
    expect(within(dialog).getAllByText("Valorant 120 Points").length).toBeGreaterThan(0);
    // Cost 15.000 and the default plan's rule price (25% over cost) = 18.750.
    expect(within(dialog).getAllByText(/Rp 15\.000/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("Rp 18.750").length).toBeGreaterThan(0);
  });

  it("lists every selected product as a card in bulk", async () => {
    const user = userEvent.setup();
    await openPage(`${ADD_PATH}?mode=bulk`);

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    await user.click(await screen.findByRole("checkbox", { name: "Select VAL420" }));
    await user.click(screen.getByRole("button", { name: "Save as draft (2)" }));

    const dialog = await screen.findByRole("dialog", { name: "Review before saving" });
    expect(within(dialog).getByText("VAL120 · Valorant 120 Points")).toBeInTheDocument();
    expect(within(dialog).getByText("VAL420 · Valorant 420 Points")).toBeInTheDocument();
  });

  it("blocks the confirm while a required field is empty", async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    await user.clear(screen.getByLabelText("VAL120 name"));

    await user.click(screen.getByRole("button", { name: "Save as draft (1)" }));

    const dialog = await screen.findByRole("dialog", { name: "Review before saving" });
    expect(within(dialog).getByRole("button", { name: "Yes, save as draft" })).toBeDisabled();
    expect(within(dialog).getByText("Product name is empty.")).toBeInTheDocument();
  });
});
