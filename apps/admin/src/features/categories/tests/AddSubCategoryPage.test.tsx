import { describe, it, expect, vi, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { waitForElementToBeRemoved } from "@testing-library/react";

import { fireEvent, renderRoute, screen, waitFor, within } from "@/test/test-utils";
import { subCategoriesService } from "../services/subCategories.service";

const LIST_PATH = "/admin/categories-preview/sub-category";

type User = ReturnType<typeof userEvent.setup>;

/** Opens the Add Sub Category modal from the list and returns the dialog element. */
async function openAdd(user: User): Promise<HTMLElement> {
  await renderRoute(LIST_PATH);
  await user.click(await screen.findByRole("button", { name: /Add Sub Category/i }));
  return screen.findByRole("dialog", { name: "Add Sub Category" });
}

/**
 * Add Sub Category form (product_requirements.md §4.5, line 210) — a modal
 * now, opened from the list's "+ Add Sub Category". Guards the reference's
 * leftovers: lorem-ipsum placeholders, the unfilled "~000×000 px" dropzone
 * caption, and the "0/280 characters" counter shown next to a mismatched
 * "52% used".
 */
describe("AddSubCategoryDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens with a real subcopy, never lorem ipsum", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    expect(within(dialog).getByRole("heading", { name: "Add Sub Category" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/lorem ipsum/i)).not.toBeInTheDocument();
  });

  it("shows every field by label with a real placeholder hint", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    expect(within(dialog).getByRole("combobox", { name: "Category" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Sub Category Name")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Currency Name")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Logo")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Description")).toBeInTheDocument();

    expect(within(dialog).getByText("Select a category")).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("e.g. Mobile Legends: Global")).toBeInTheDocument();
  });

  it("accepts WEBP alongside JPG/JPEG/PNG and states a real max display size", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    expect(within(dialog).getByText(/JPG, JPEG, PNG, WEBP up to 10mb/)).toBeInTheDocument();
    expect(within(dialog).getByText(/800×600 px/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/000×000/)).not.toBeInTheDocument();
  });

  it("derives the description counter percentage from the actual character count", async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    expect(within(dialog).getByText("0/280 characters")).toBeInTheDocument();
    expect(within(dialog).getByText("0% used")).toBeInTheDocument();
    expect(within(dialog).queryByText("52% used")).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Description"), "Fourteen chars");

    expect(within(dialog).getByText("14/280 characters")).toBeInTheDocument();
    expect(within(dialog).getByText("5% used")).toBeInTheDocument();
  });

  it("blocks submit and never calls create when required fields are empty", async () => {
    const createSpy = vi.spyOn(subCategoriesService, "create");
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Category is required")).toBeInTheDocument();
    expect(within(dialog).getByText("Sub Category Name is required")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("creates the sub category and closes the modal on a valid submit", async () => {
    const createSpy = vi.spyOn(subCategoriesService, "create");
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    await user.click(within(dialog).getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Mobile Legends" }));
    await user.type(within(dialog).getByLabelText("Sub Category Name"), "Mobile Legends: Philippines");
    await user.type(within(dialog).getByLabelText("Currency Name"), "Diamonds");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        // The select is fed by the API now, so the id is whatever the
        // first category row carries rather than a fixture literal.
        category_id: expect.stringMatching(/^\d+$/),
        name: "Mobile Legends: Philippines",
        currency_name: "Diamonds",
        status: "active",
      }),
    );
    if (screen.queryByRole("dialog", { name: "Add Sub Category" })) await waitForElementToBeRemoved(dialog);
    expect(await screen.findByText("Mobile Legends: Philippines")).toBeInTheDocument();
  });

  /* The logo has to travel as a file part. Sending its name as `logo_url` left
     the API with no file at all, so every create failed — with a logo or without. */
  it("sends the picked logo as a file, not just its name", async () => {
    const createSpy = vi.spyOn(subCategoriesService, "create");
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    await user.click(within(dialog).getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Mobile Legends" }));
    await user.type(within(dialog).getByLabelText("Sub Category Name"), "With Logo");
    await user.type(within(dialog).getByLabelText("Currency Name"), "Diamonds");

    const logo = new File(["logo"], "logo.png", { type: "image/png" });
    fireEvent.change(within(dialog).getByLabelText("Logo"), { target: { files: [logo] } });

    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    const sent = vi.mocked(createSpy).mock.calls[0][0];
    expect(sent.logo).toBeInstanceOf(File);
    expect((sent.logo as File).name).toBe("logo.png");
  });

  /* Optional on both sides now: a sub category is creatable before its artwork
     exists. This is the 422 "logo wajib diisi." that started it. */
  it("creates a sub category without any logo", async () => {
    const createSpy = vi.spyOn(subCategoriesService, "create");
    const user = userEvent.setup();
    const dialog = await openAdd(user);

    await user.click(within(dialog).getByRole("combobox", { name: "Category" }));
    await user.click(await screen.findByRole("option", { name: "Mobile Legends" }));
    await user.type(within(dialog).getByLabelText("Sub Category Name"), "No Logo");
    await user.type(within(dialog).getByLabelText("Currency Name"), "Diamonds");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ logo: null })),
    );
  });
});
