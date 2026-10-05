import { describe, it, expect, vi, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderRoute, screen, within } from "@/test/test-utils";
import { productsService } from "../services/products.service";

const LIST_PATH = "/admin/products-preview/main";
const FIRST_ROW = "Weekly Diamond Pass (One Week)";

async function selectTwoRows(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(FIRST_ROW);
  const rowCheckboxes = screen.getAllByRole("checkbox", { name: "Select row" });
  await user.click(rowCheckboxes[0]);
  await user.click(rowCheckboxes[1]);
}

async function openBulkMenu(user: ReturnType<typeof userEvent.setup>, count: number) {
  await user.click(await screen.findByRole("button", { name: new RegExp(`${count} items selected`) }));
}

/**
 * The selection menu (product_requirements.md §4.6) — a single "N items
 * selected" chip that opens the bulk actions (Edit Logo, Uxiotopup Update, Show
 * Price, Unpublish, Archive), only while rows are selected.
 */
describe("Main Products bulk actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reveals the selection chip and its actions only once rows are selected", async () => {
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await screen.findByText(FIRST_ROW);
    expect(screen.queryByRole("button", { name: /items selected/ })).not.toBeInTheDocument();

    await selectTwoRows(user);
    await openBulkMenu(user, 2);

    for (const name of ["Edit Logo", "Uxiotopup Update", "Show Price", "Unpublish"]) {
      expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument();
    }

    // There is no Archive here: a product is unlisted, never removed.
    expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("unpublishes nothing until the confirmation is accepted", async () => {
    const spy = vi.spyOn(productsService, "bulkSetPublished").mockResolvedValue({ updated: 2, skipped: [] });
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await selectTwoRows(user);
    await openBulkMenu(user, 2);
    await user.click(await screen.findByRole("menuitem", { name: "Unpublish" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Unpublish 2 products?")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Unpublish" }));
    expect(spy).toHaveBeenCalledWith(expect.arrayContaining([expect.any(String)]), false);
    expect(spy.mock.calls[0][0]).toHaveLength(2);
    // Bulk stays one-directional: a selection can hold rows in any state, so
    // there is no single one to invert.
    expect(spy.mock.calls[0][1]).toBe(false);
  });

  it("confirms and fires a bulk Uxiolabs update", async () => {
    const spy = vi.spyOn(productsService, "bulkUxiolabsUpdate").mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await selectTwoRows(user);
    await openBulkMenu(user, 2);
    await user.click(await screen.findByRole("menuitem", { name: "Uxiotopup Update" }));

    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Update" }));
    expect(spy.mock.calls[0][0]).toHaveLength(2);
  });

  it("cancelling the confirmation unpublishes nothing", async () => {
    const spy = vi.spyOn(productsService, "bulkSetPublished").mockResolvedValue({ updated: 2, skipped: [] });
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await selectTwoRows(user);
    await openBulkMenu(user, 2);
    await user.click(await screen.findByRole("menuitem", { name: "Unpublish" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }));

    expect(spy).not.toHaveBeenCalled();
  });

  it("marks a single-row unpublish in the singular", async () => {
    vi.spyOn(productsService, "bulkSetPublished").mockResolvedValue({ updated: 2, skipped: [] });
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await screen.findByText(FIRST_ROW);
    await user.click(screen.getAllByRole("checkbox", { name: "Select row" })[0]);
    await openBulkMenu(user, 1);
    await user.click(await screen.findByRole("menuitem", { name: "Unpublish" }));

    expect(within(await screen.findByRole("alertdialog")).getByText("Unpublish this product?")).toBeInTheDocument();
  });
});
