import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderRoute, screen, within } from "@/test/test-utils";
import { useAuthStore } from "@/store/useAuthStore";
import { productsService } from "../services/products.service";

const LIST_PATH = "/admin/products-preview/main";
const ARCHIVED_PATH = "/admin/products-preview/archived";
const FIRST_ROW = "Weekly Diamond Pass (One Week)";
/** The one fixture row that is not live — it reads Draft. */
const INACTIVE_ROW = "Diamond Top Up 355";
/** Promoted, but the provider has the SKU switched off. */
const BLOCKED_ROW = "Genesis Crystal 60";
/** Soft-deleted; only reachable through the Archived tab. */
const ARCHIVED_ROW = "Blessing of the Welkin Moon";

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, row = FIRST_ROW) {
  await user.click(await screen.findByRole("button", { name: `Actions for ${row}` }));
}

/**
 * The row action menu (product_requirements.md §4.6). Every action is wired:
 * Uxiotopup Update goes through a confirm dialog, and Edit/Delete are unchanged.
 * The lifecycle item's label mirrors the row's Status badge, both directions.
 * Price visibility and the price-limit page are deliberately off this menu.
 */
describe("Main Products row actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unpublishes a live row only after the confirmation is accepted", async () => {
    const spy = vi.spyOn(productsService, "bulkSetPublished").mockResolvedValue({ updated: 1, skipped: [] });
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await openRowMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Unpublish" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Unpublish this product?")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Unpublish" }));
    // A single id, from the API row (not a hand-written fixture string).
    expect(spy.mock.calls[0][0]).toEqual([expect.stringMatching(/^\d+$/)]);
    expect(spy.mock.calls[0][1]).toBe(false);
  });

  // The label has to follow the Status column: offering "Unpublish" on a row
  // that already reads Draft is a no-op the admin cannot tell apart from a
  // failure.
  it("offers Publish on a row that is not live, and publishes it", async () => {
    const spy = vi.spyOn(productsService, "bulkSetPublished").mockResolvedValue({ updated: 1, skipped: [] });
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await openRowMenu(user, INACTIVE_ROW);
    expect(screen.queryByRole("menuitem", { name: "Unpublish" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: "Publish" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Publish this product?")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Publish" }));
    expect(spy.mock.calls[0][1]).toBe(true);
  });

  it("offers Unpublish, not Publish, on a live row", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await openRowMenu(user);
    expect(await screen.findByRole("menuitem", { name: "Unpublish" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Publish" })).not.toBeInTheDocument();
  });

  /**
   * Publishing needs a supplier to order from. The server refuses and says why,
   * so the menu disables the item and repeats that reason rather than letting
   * the admin click into a 422.
   */
  it("disables Publish and shows the server's reason when it cannot publish", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await openRowMenu(user, BLOCKED_ROW);
    const item = await screen.findByRole("menuitem", { name: /Publish/ });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(within(item).getByText("SKU sedang nonaktif di provider.")).toBeInTheDocument();
  });

  it("an archived row offers only Restore", async () => {
    const spy = vi.spyOn(productsService, "restore").mockResolvedValue(undefined);
    const user = userEvent.setup();
    // Archived rows are out of the main list — they live on their own tab.
    await renderRoute(ARCHIVED_PATH);

    await openRowMenu(user, ARCHIVED_ROW);
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Restore"]);

    await user.click(items[0]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("confirms a Uxiotopup Update for the single row", async () => {
    const spy = vi.spyOn(productsService, "bulkUxiolabsUpdate").mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await openRowMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Uxiotopup Update" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Update" }));

    expect(spy.mock.calls[0][0]).toHaveLength(1);
  });
});

/**
 * Editing an existing product's pricing. Margins are what the platform prices
 * on now, so the form has to show what the product currently sells at and be
 * able to change it — the five money fields it replaced were never written by
 * anything at all.
 */
describe("Edit Main Product — pricing", () => {
  beforeEach(() => {
    // The Edit item is `<Can permission="products.update">`-gated.
    useAuthStore.setState({ token: "test-token", permissions: ["*"] });
  });

  afterEach(() => {
    useAuthStore.setState({ token: null, permissions: [] });
    vi.restoreAllMocks();
  });

  async function openEdit(user: ReturnType<typeof userEvent.setup>) {
    await renderRoute(LIST_PATH);
    await openRowMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Edit Product" }));
    return screen.findByRole("dialog", { name: "Edit Main Product" });
  }

  it("splits the form into Product, Pricing & Margin and Product Mix", async () => {
    const user = userEvent.setup();
    const dialog = await openEdit(user);

    expect(within(dialog).getByRole("tab", { name: "Product" })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "Pricing & Margin" })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "Product Mix" })).toBeInTheDocument();
  });

  it("shows the provider's own SKU next to the internal product code", async () => {
    const user = userEvent.setup();
    const dialog = await openEdit(user);

    // The internal code is what the admin edits; the supplier's SKU is a
    // read-only detail so the two are tellable apart.
    expect(within(dialog).getByLabelText("Product Code")).toHaveValue("MLBB-WDP-01");
    expect(within(dialog).getByText("Provider Code: mlweek")).toBeInTheDocument();
  });

  it("prefills the margin each plan currently sells at", async () => {
    const user = userEvent.setup();
    const dialog = await openEdit(user);

    await user.click(within(dialog).getByRole("tab", { name: "Pricing & Margin" }));

    // The fixture's default tier sells at cost × 1.07 — the markup the price
    // cell shows as 7.0%, read back into the field an admin edits.
    const field = await within(dialog).findByLabelText("Basic (free) margin (%) · default tier");
    await vi.waitFor(() => expect(field).toHaveValue("7"));
  });

  it("sends the edited margin to the product's own pricing endpoint", async () => {
    const marginSpy = vi.spyOn(productsService, "setMargin");
    const user = userEvent.setup();
    const dialog = await openEdit(user);

    await user.click(within(dialog).getByRole("tab", { name: "Pricing & Margin" }));
    const field = await within(dialog).findByLabelText("Basic (free) margin (%) · default tier");
    await user.clear(field);
    await user.type(field, "25");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const [id, input] = (await vi.waitFor(() => {
      expect(marginSpy).toHaveBeenCalled();
      return marginSpy.mock.calls[0];
    })) as [string, { margins: Record<number, number | null> }];

    // The list is served by the fake API, so the row carries its numeric id.
    expect(id).toBe("1");
    expect(Object.values(input.margins)).toContain(25);
  });
});
