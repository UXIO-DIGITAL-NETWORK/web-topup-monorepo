import { describe, it, expect, vi, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { waitForElementToBeRemoved } from "@testing-library/react";

import { renderRoute, screen, within } from "@/test/test-utils";
import { categoriesService } from "../services/categories.service";

const LIST_PATH = "/admin/categories-preview/category";

type User = ReturnType<typeof userEvent.setup>;

/** Opens the Add Category modal from the list and returns the dialog element. */
async function openAdd(user: User): Promise<HTMLElement> {
  await renderRoute(LIST_PATH);
  await user.click(await screen.findByRole("button", { name: /Add Category/i }));
  return screen.findByRole("dialog", { name: "Add Category" });
}

async function fillRequiredFields(user: User, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole("combobox", { name: "Category Type" }));
  await user.click(await screen.findByRole("option", { name: "Mobile Game" }));
  await user.type(within(dialog).getByLabelText("Category Name"), "Wild Rift");
  await user.type(within(dialog).getByLabelText("Category Code"), "WR");
  await user.type(within(dialog).getByLabelText("Category Slug"), "wild-rift");
}

/** The Media & SEO fields live on the second tab; switch to it first. */
async function goToMediaTab(user: User, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole("tab", { name: "Media & SEO" }));
}

async function waitForModalClosed() {
  const dialog = screen.queryByRole("dialog", { name: "Add Category" });
  if (dialog) await waitForElementToBeRemoved(dialog);
}

/**
 * Add Category form (product_requirements.md §4.5) — a modal now, opened from
 * the list's "+ Add Category". Rendered via the unauthenticated preview route.
 */
describe("AddCategoryDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens with the header", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);
    expect(within(dialog).getByRole("heading", { name: "Add Category" })).toBeInTheDocument();
  });

  it("shows both section headings and their exact subcopies", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    expect(within(dialog).getByRole("heading", { name: "Basic information" })).toBeInTheDocument();
    expect(within(dialog).getByText("Type and category identity on the storefront.")).toBeInTheDocument();

    expect(within(dialog).getByRole("heading", { name: "Category form" })).toBeInTheDocument();
    expect(within(dialog).getByText("Input fields shown to buyers when ordering.")).toBeInTheDocument();
  });

  it("shows the Basic information fields by label (no UID Parser)", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    for (const label of [
      "Category Type",
      "Region",
      "Category Name",
      "Category Sub Name",
      "Category Code",
      "Category Slug",
    ]) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
    }

    // The dead UID Parser field is gone.
    expect(within(dialog).queryByLabelText("Category UID Parser")).not.toBeInTheDocument();
  });

  it("shows the field-key guide, explaining the field definition rather than only forbidding two keys", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    expect(within(dialog).getByText(/technical name used with the supplier/)).toBeInTheDocument();
    expect(within(dialog).getByText(/must not be whatsapp or email/)).toBeInTheDocument();
    expect(within(dialog).getByText(/column #1 becomes the account id/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Examples: Mobile Legends/)).toBeInTheDocument();
  });

  it("shows the empty-forms message before any field is added", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    expect(within(dialog).getByText('No forms yet. Click "Add Form" to add one.')).toBeInTheDocument();
  });

  it("clicking '+ Add Form' adds a new field-definition row", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    expect(within(dialog).queryByLabelText(/^Key$/i)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /Add Form/i }));

    expect(await within(dialog).findAllByLabelText(/^Key$/i)).toHaveLength(1);
    expect(within(dialog).queryByText('No forms yet. Click "Add Form" to add one.')).not.toBeInTheDocument();
  });

  it("shows validation errors and blocks submit when required fields are empty", async () => {
    const createSpy = vi.spyOn(categoriesService, "create");
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Category Type is required")).toBeInTheDocument();
    expect(within(dialog).getByText("Category Name is required")).toBeInTheDocument();
    expect(within(dialog).getByText("Category Code is required")).toBeInTheDocument();
    expect(within(dialog).getByText("Category Slug is required")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("blocks submit and shows the reserved-key message for a whatsapp/email field key", async () => {
    const createSpy = vi.spyOn(categoriesService, "create");
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    await fillRequiredFields(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: /Add Form/i }));
    await user.type(within(dialog).getByLabelText(/^Key$/i), "whatsapp");

    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await within(dialog).findByText("Reserved key — buyer contact is taken from their account."),
    ).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("creates the category and closes the modal, showing the new row on valid submit", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    await fillRequiredFields(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitForModalClosed();
    expect(await screen.findByText("Wild Rift")).toBeInTheDocument();
  });

  it("shows the Media & description and SEO section headings and their exact subcopies", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);
    await goToMediaTab(user, dialog);

    expect(within(dialog).getByRole("heading", { name: "Media & description" })).toBeInTheDocument();
    expect(within(dialog).getByText("Category logo and description content for the product page.")).toBeInTheDocument();

    expect(within(dialog).getByRole("heading", { name: "SEO" })).toBeInTheDocument();
    expect(within(dialog).getByText("Meta tags for the category page on search engines.")).toBeInTheDocument();
  });

  it("shows every Media & description and SEO field by label", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);
    await goToMediaTab(user, dialog);

    for (const label of [
      "Category Logo",
      "Card Background",
      "Checkout Banner",
      "Description",
      "Meta Title",
      "Meta Description",
      "OG Image",
      "Meta Keyword",
      "Meta Robot",
    ]) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("keeps the Meta Description character count and percentage in sync", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);
    await goToMediaTab(user, dialog);

    // "Fourteen chars" = 14 chars → 14/280 = 5%.
    await user.type(within(dialog).getByLabelText("Meta Description"), "Fourteen chars");

    expect(within(dialog).getByText("14/280 characters")).toBeInTheDocument();
    expect(within(dialog).getByText("5% used")).toBeInTheDocument();
  });

  it("includes the media and SEO fields in the create payload on valid submit", async () => {
    const createSpy = vi.spyOn(categoriesService, "create");
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    await fillRequiredFields(user, dialog);
    await goToMediaTab(user, dialog);
    await user.type(within(dialog).getByLabelText("Description"), "Top up MLBB diamonds instantly.");
    await user.type(within(dialog).getByLabelText("Meta Title"), "Mobile Legends Top Up");
    await user.type(within(dialog).getByLabelText("Meta Description"), "Cheap MLBB diamonds");
    await user.type(within(dialog).getByLabelText("Meta Keyword"), "top up ml, diamond ml");
    await user.click(within(dialog).getByRole("combobox", { name: "Meta Robot" }));
    await user.click(await screen.findByRole("option", { name: "Index, Follow" }));

    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Top up MLBB diamonds instantly.",
        meta_title: "Mobile Legends Top Up",
        meta_description: "Cheap MLBB diamonds",
        meta_keywords: ["top up ml", "diamond ml"],
        meta_robots: "Index, Follow",
      }),
    );
  });
});
