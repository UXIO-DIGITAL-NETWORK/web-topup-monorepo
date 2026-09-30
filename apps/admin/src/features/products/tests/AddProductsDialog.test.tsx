import { describe, it, expect, vi, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderRoute, screen, within } from "@/test/test-utils";
import { productsService } from "../services/products.service";

const LIST_PATH = "/admin/products-preview/main";
const NOT_ADDED = "Valorant 120 Points";
const ALSO_NOT_ADDED = "Valorant 420 Points";
const ALREADY_ADDED = "Mobile Legends 86 Diamond";

/**
 * Add Products: one modal that creates AND configures, for one product or many.
 *
 * Two rules carry the design and are pinned here: a service that is already ours
 * cannot be added twice, and single mode adds ONE product even if the admin
 * keeps ticking.
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

  it("opens from the Add menu with both modes", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);

    expect(within(dialog).getByRole("button", { name: "Single" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Bulk" })).toBeInTheDocument();
    expect(within(dialog).getByText("0 selected")).toBeInTheDocument();
  });

  it("lists the provider services, paginated", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);

    expect(await within(dialog).findByText(NOT_ADDED)).toBeInTheDocument();
    expect(within(dialog).getByText("Page 1 of 1")).toBeInTheDocument();
  });

  /** "Kalau dia udah ada di data kita itu enggak bisa double." */
  it("refuses to select a service that is already a product", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);
    await within(dialog).findByText(ALREADY_ADDED);

    expect(within(dialog).getByText(/ML86.*already a product/)).toBeInTheDocument();

    await user.click(within(dialog).getByText(ALREADY_ADDED));

    expect(within(dialog).getByText("0 selected")).toBeInTheDocument();
  });

  it("single mode keeps exactly one product selected", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);
    await user.click(await within(dialog).findByText(NOT_ADDED));
    expect(within(dialog).getByText("1 selected")).toBeInTheDocument();

    // Ticking a second one REPLACES the first, rather than refusing the click.
    await user.click(await within(dialog).findByText(ALSO_NOT_ADDED));
    expect(within(dialog).getByText("1 selected")).toBeInTheDocument();
  });

  it("bulk mode accumulates the selection", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user, "Bulk");
    await user.click(await within(dialog).findByText(NOT_ADDED));
    await user.click(await within(dialog).findByText(ALSO_NOT_ADDED));

    expect(within(dialog).getByText("2 selected")).toBeInTheDocument();
  });

  it("saves as a draft when asked", async () => {
    const spy = vi
      .spyOn(productsService, "addFromSupplier")
      .mockResolvedValue({ created: 1, published: 0, skipped: [] });
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);
    await user.click(await within(dialog).findByText(NOT_ADDED));
    await user.click(within(dialog).getByRole("button", { name: "Save as draft" }));

    expect(spy.mock.calls[0][0].publish).toBe(false);
    expect(spy.mock.calls[0][0].items[0].buyer_sku_code).toBe("VAL120");
  });

  it("sends the data typed in the modal with the product", async () => {
    const spy = vi
      .spyOn(productsService, "addFromSupplier")
      .mockResolvedValue({ created: 1, published: 1, skipped: [] });
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    const dialog = await openAdd(user);
    await user.click(await within(dialog).findByText(NOT_ADDED));

    const nameField = within(dialog).getByLabelText("Product Name");
    await user.clear(nameField);
    await user.type(nameField, "Valorant 120 Spesial");

    await user.click(within(dialog).getByRole("button", { name: "Publish" }));

    const payload = spy.mock.calls[0][0];
    expect(payload.publish).toBe(true);
    expect(payload.items[0].name).toBe("Valorant 120 Spesial");
  });
});
