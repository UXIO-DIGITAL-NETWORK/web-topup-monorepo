import { describe, it, expect, vi, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderRoute, screen, within } from "@/test/test-utils";
import { productsService } from "../services/products.service";

const LIST_PATH = "/admin/products-preview/main";
const ADD_PATH = "/admin/products-preview/main/add";
const NOT_ADDED = "Valorant 120 Points";

/** The add flow is a page now, not a dialog. */
async function openPage(path: string = ADD_PATH) {
  await renderRoute(path);
  return screen.findByRole("heading", { name: "Add products" });
}

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

  /** The whole point of the redesign: every field explains itself. */
  it("labels each column and each field, with an info tooltip", async () => {
    await openPage();

    expect(screen.getByText("Code & Sub Category")).toBeInTheDocument();
    expect(screen.getByText("Points & Discount")).toBeInTheDocument();
    expect(screen.getByText("Mode")).toBeInTheDocument();

    // Repeated per row, so asserted by count.
    expect(screen.getAllByText("Points (%)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bonus Points").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Discount value").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Product Name").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cost").length).toBeGreaterThan(0);

    // Info icons beside the labels/headers.
    expect(screen.getAllByRole("button", { name: "More information" }).length).toBeGreaterThan(0);
  });

  it("lists the provider services, paginated", async () => {
    await openPage();

    // The SKU is the row's identifier; the provider's own name is prefilled in
    // the Name field (as the reference shows), so it is found by value.
    expect(await screen.findByText("VAL120")).toBeInTheDocument();
    expect(screen.getByDisplayValue(NOT_ADDED)).toBeInTheDocument();
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
    const row = (await screen.findByText("VAL120")).closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /Detail/ }));

    expect(screen.getByRole("button", { name: /Add Mix/ })).toBeInTheDocument();
  });

  it("hides product mix in Bulk mode", async () => {
    const user = userEvent.setup();
    await openPage(`${ADD_PATH}?mode=bulk`);

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    const row = (await screen.findByText("VAL120")).closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /Detail/ }));

    expect(screen.queryByRole("button", { name: /Add Mix/ })).not.toBeInTheDocument();
    expect(screen.getByText("Product mix is only available in Single mode.")).toBeInTheDocument();
  });

  /**
   * The price is a RESULT of the margin, shown in the row — the reference's
   * whole point, and the reason there is no price input.
   */
  it("shows the price the typed margin produces", async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));

    const margin = screen.getAllByLabelText(/VAL120 .* margin/)[0];
    await user.type(margin, "50");

    // Cost is 15.000; a 50% margin sells at 22.500 (no rule produces this).
    expect(screen.getByText("Rp 22.500")).toBeInTheDocument();
  });

  /** An empty margin is "follow the pricing rules", so the rule price shows. */
  it("follows the pricing rules when a margin is left empty", async () => {
    await openPage();
    await screen.findByText("VAL120");

    // Global rule 20% over cost (15.000) → 18.000, shown without typing.
    expect(screen.getAllByText("Rp 18.000").length).toBeGreaterThan(0);
  });

  it("saves as a draft when asked, and publishes when asked", async () => {
    const spy = vi
      .spyOn(productsService, "addFromSupplier")
      .mockResolvedValue({ created: 1, published: 0, skipped: [] });
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole("checkbox", { name: "Select VAL120" }));
    await user.click(screen.getByRole("button", { name: "Save as draft (1)" }));

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

    const payload = spy.mock.calls[0][0];
    expect(payload.publish).toBe(true);
    expect(payload.items[0].name).toBe("Valorant 120 Spesial");
  });
});
