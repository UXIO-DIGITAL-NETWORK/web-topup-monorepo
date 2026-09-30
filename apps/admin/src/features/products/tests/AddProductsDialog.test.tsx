import { describe, it, expect, vi, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderRoute, screen, within } from "@/test/test-utils";
import { productsService } from "../services/products.service";

const LIST_PATH = "/admin/products-preview/main";
const NOT_ADDED = "Valorant 120 Points";

/**
 * Add Products, as a TABLE: the filtered provider price list, one row per
 * service, editable in place.
 *
 * The rules worth pinning: a service that is already ours cannot be ticked,
 * single mode adds ONE product, and the price shown is what the typed margin
 * produces — not something the admin types.
 */
async function openAdd(user: ReturnType<typeof userEvent.setup>, entry: "Single" | "Bulk" = "Single") {
  await user.click(await screen.findByRole("button", { name: /Add Main Products/i }));
  await user.click(await screen.findByRole("menuitem", { name: entry }));

  return screen.findByRole("dialog", { name: "Add products" });
}

describe("AddProductsDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens with both modes, the two filters, and an empty count", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);

    expect(within(dialog).getByRole("button", { name: "Single" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Bulk" })).toBeInTheDocument();
    // Provider and category, the pair the reference puts above the table.
    expect(within(dialog).getByLabelText("Supplier")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Our category")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save as draft (0)" })).toBeInTheDocument();
  });

  it("lists the provider services, paginated", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);

    // The SKU is the row's identifier; the provider's own name is prefilled in
    // the Name field (as the reference shows), so it is found by value.
    expect(await within(dialog).findByText("VAL120")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue(NOT_ADDED)).toBeInTheDocument();
    expect(within(dialog).getByText("Page 1 of 1")).toBeInTheDocument();
  });

  /** "Kalau dia udah ada di data kita itu enggak bisa double." */
  it("refuses to select a service that is already a product", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);
    const checkbox = await within(dialog).findByRole("checkbox", { name: "Select ML86" });

    expect(checkbox).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Save as draft (0)" })).toBeInTheDocument();
  });

  it("single mode keeps exactly one product selected", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);
    await user.click(await within(dialog).findByRole("checkbox", { name: "Select VAL120" }));
    expect(within(dialog).getByRole("button", { name: "Save as draft (1)" })).toBeInTheDocument();

    // Ticking a second one REPLACES the first, rather than refusing the click.
    await user.click(await within(dialog).findByRole("checkbox", { name: "Select VAL420" }));
    expect(within(dialog).getByRole("button", { name: "Save as draft (1)" })).toBeInTheDocument();
  });

  it("bulk mode accumulates the selection", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user, "Bulk");
    await user.click(await within(dialog).findByRole("checkbox", { name: "Select VAL120" }));
    await user.click(await within(dialog).findByRole("checkbox", { name: "Select VAL420" }));

    expect(within(dialog).getByRole("button", { name: "Save as draft (2)" })).toBeInTheDocument();
  });

  /**
   * The price is a RESULT of the margin, shown in the row — the reference's
   * whole point, and the reason there is no price input.
   */
  it("shows the price the typed margin produces", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);
    await user.click(await within(dialog).findByRole("checkbox", { name: "Select VAL120" }));

    const margin = within(dialog).getAllByLabelText(/VAL120 .* margin/)[0];
    await user.type(margin, "20");

    // Cost is 15.000; a 20% margin sells at 18.000.
    expect(within(dialog).getByText("Rp 18.000")).toBeInTheDocument();
  });

  it("saves as a draft when asked, and publishes when asked", async () => {
    const spy = vi
      .spyOn(productsService, "addFromSupplier")
      .mockResolvedValue({ created: 1, published: 0, skipped: [] });
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);
    await user.click(await within(dialog).findByRole("checkbox", { name: "Select VAL120" }));
    await user.click(within(dialog).getByRole("button", { name: "Save as draft (1)" }));

    expect(spy.mock.calls[0][0].publish).toBe(false);
    expect(spy.mock.calls[0][0].items[0].buyer_sku_code).toBe("VAL120");
  });

  it("sends the data typed in the row with the product", async () => {
    const spy = vi
      .spyOn(productsService, "addFromSupplier")
      .mockResolvedValue({ created: 1, published: 1, skipped: [] });
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);
    await user.click(await within(dialog).findByRole("checkbox", { name: "Select VAL120" }));

    const nameField = within(dialog).getByLabelText("VAL120 name");
    await user.clear(nameField);
    await user.type(nameField, "Valorant 120 Spesial");

    await user.click(within(dialog).getByRole("button", { name: "Publish (1)" }));

    const payload = spy.mock.calls[0][0];
    expect(payload.publish).toBe(true);
    expect(payload.items[0].name).toBe("Valorant 120 Spesial");
  });
});
