import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { fireEvent, makeUser, renderRoute, screen, waitFor, within } from "@/test/test-utils";
import { useAuthStore } from "@/store/useAuthStore";
import { websiteSubscriptionService } from "@/features/dashboard/services/websiteSubscription.service";
import { settingsService, usersService } from "../services/administration.service";

// Guarded routes with no preview twin — the store is seeded so requireAuth and
// requirePermission run for real rather than being bypassed.
beforeEach(() => {
  useAuthStore.setState({ token: "test-token", user: makeUser(), permissions: ["*"] });
});

afterEach(() => {
  useAuthStore.setState({ token: null, user: null, permissions: [] });
});

describe("administration routes", () => {
  it("Payment lists channels with their code and fee", async () => {
    await renderRoute("/admin/payments");

    expect(await screen.findByRole("heading", { name: "Payment" })).toBeInTheDocument();
    expect(await screen.findByText("BCA Virtual Account")).toBeInTheDocument();
    expect(await screen.findByText("bca_va")).toBeInTheDocument();
  });

  it("Payment is read-only — no row actions or bulk selection", async () => {
    await renderRoute("/admin/payments");
    await screen.findByText("BCA Virtual Account");

    expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("Users lists members with their balance", async () => {
    await renderRoute("/admin/users");

    expect(await screen.findByRole("heading", { name: "Users" })).toBeInTheDocument();
    expect(await screen.findByText("Randy Galang")).toBeInTheDocument();
    expect(await screen.findByText("randy@example.com")).toBeInTheDocument();
  });

  it("Users row menu adjusts balance through the audited dialog, requiring a reason", async () => {
    const adjustSpy = vi.spyOn(usersService, "adjustBalance").mockResolvedValue({
      id: "1",
      role_id: "2",
      name: "Randy Galang",
      email: "randy@example.com",
      phone: "628",
      balance: 65000,
      point: 120,
      locale: "id",
      status: "active",
      created_at: "2026-07-01",
    });
    const user = userEvent.setup();
    await renderRoute("/admin/users");

    await user.click(await screen.findByRole("button", { name: "Actions for Randy Galang" }));
    await user.click(await screen.findByRole("menuitem", { name: "Adjust Balance" }));

    const dialog = await screen.findByRole("dialog", { name: /Adjust balance/ });
    await user.type(within(dialog).getByLabelText("Amount"), "50000");
    await user.click(within(dialog).getByRole("button", { name: "Adjust Balance" }));
    expect(await within(dialog).findByText("A reason is required")).toBeInTheDocument();
    expect(adjustSpy).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Reason"), "compensation");
    await user.click(within(dialog).getByRole("button", { name: "Adjust Balance" }));
    expect(adjustSpy).toHaveBeenCalledWith("1", { amount: 50000, direction: "credit", reason: "compensation" });
  });

  it("Settings opens on the first group and marks the public values", async () => {
    await renderRoute("/admin/settings");

    // The card header names the active group — there is no page-level "Settings" card.
    expect(await screen.findByRole("heading", { name: "General" })).toBeInTheDocument();
    // General leads the response, so it is the tab the page opens on.
    expect(await screen.findByLabelText("Site Name")).toBeInTheDocument();
    // The Public badge is what tells an admin a value reaches the storefront.
    expect((await screen.findAllByText("Public")).length).toBeGreaterThan(0);
  });

  // The sections are tabs, not a stack of cards: the page has to show one at a
  // time, and the strip has to reach the ones further down the response.
  it("Settings shows one section at a time", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/settings");

    expect(await screen.findByLabelText("Site Name")).toBeInTheDocument();
    expect(screen.queryByLabelText("WhatsApp")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Contact" }));

    expect(await screen.findByLabelText("WhatsApp")).toBeInTheDocument();
    expect(screen.queryByLabelText("Site Name")).not.toBeInTheDocument();
  });

  // An inactive TabsContent is unmounted, so a form that seeded its inputs from
  // the response would drop whatever the admin had typed the moment they looked
  // at another tab. The draft has to outlive the panel it was typed into.
  it("Settings keeps an unsaved edit across a tab switch", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/settings");

    const siteName = await screen.findByLabelText("Site Name");
    await user.clear(siteName);
    await user.type(siteName, "TopupGame Baru");

    await user.click(screen.getByRole("tab", { name: "Contact" }));
    await screen.findByLabelText("WhatsApp");
    await user.click(screen.getByRole("tab", { name: "General" }));

    expect(await screen.findByLabelText("Site Name")).toHaveValue("TopupGame Baru");
  });

  it("Settings explains each section and its settings with info tooltips", async () => {
    await renderRoute("/admin/settings");
    await screen.findByLabelText("Site Name");

    // The section's help and a switch's help read as plain text under their
    // titles (the Figma card layout), so only the field rows keep an icon:
    // Site Name, and the logo dropzone, which owns its own label.
    expect(screen.getByText(/Site identity and the global switches/)).toBeInTheDocument();
    expect(screen.getByText(/Takes the storefront offline/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "More information" })).toHaveLength(2);
  });

  it("Settings saves only after the Edit → Save → confirm flow", async () => {
    const updateSpy = vi.spyOn(settingsService, "update").mockResolvedValue([]);
    const user = userEvent.setup();
    await renderRoute("/admin/settings");
    await screen.findByLabelText("Site Name");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Save Data?" });
    expect(updateSpy).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Yes, Save" }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    // Back to the resting state once the write lands.
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    // The spy is shared with later tests, which read `mock.calls[0]`.
    updateSpy.mockRestore();
  });

  it("Settings lists the tabs in a fixed order, General first", async () => {
    await renderRoute("/admin/settings");
    await screen.findByLabelText("Site Name");

    const names = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(names).toEqual(["General", "Contact", "Operational", "Payment", "SEO", "Social", "Licence"]);
  });

  it("Settings gives SEO and Social their long card titles", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/settings");

    await user.click(await screen.findByRole("tab", { name: "SEO" }));
    expect(await screen.findByRole("heading", { name: "Search Engine Optimization (SEO)" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Social" }));
    expect(await screen.findByRole("heading", { name: "Social Profile Link" })).toBeInTheDocument();
  });

  it("Settings stacks each payment-method expiry under its label at full width", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/settings");
    await user.click(await screen.findByRole("tab", { name: "Operational" }));

    const input = await screen.findByDisplayValue("15");
    expect(input).toHaveClass("w-full");
    expect(input).not.toHaveClass("w-28");
  });

  it("Settings Cancel throws away the unsaved edits", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/settings");

    const siteName = await screen.findByLabelText("Site Name");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(siteName);
    await user.type(siteName, "Dibuang");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByLabelText("Site Name")).toHaveValue("TopUpGame.ID");
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("Settings offers no Edit on the read-only Licence tab", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/settings");
    await user.click(await screen.findByRole("tab", { name: "Licence" }));

    await screen.findByText("Expiring soon");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  // The panel and the API deploy separately, so the client repeats the API's
  // list of groups it does not own. The fixture still sends both, which is the
  // case this guards: a stale API must not resurrect an editable licence, and a
  // second "licence" tab would collide with the read-only one.
  it("Settings leaves out the groups it does not own", async () => {
    await renderRoute("/admin/settings");
    await screen.findByLabelText("Site Name");

    expect(screen.queryByRole("tab", { name: "Pricing" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab", { name: "Licence" })).toHaveLength(1);
  });

  it("Settings reports the licence read-only instead of editing it", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/settings");
    await screen.findByLabelText("Site Name");

    await user.click(screen.getByRole("tab", { name: "Licence" }));

    // The subscription answer the sidebar card gives, not the `licence` rows:
    // the Hub owns those and rewrites them every five minutes.
    expect(await screen.findByText("Expiring soon")).toBeInTheDocument();
    expect(screen.getByText("9 days")).toBeInTheDocument();

    // Nothing here is a field. An edit would be reverted by the next Hub sync,
    // and until it was, `is_serving` decides whether the storefront answers.
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).queryAllByRole("textbox")).toHaveLength(0);
    expect(within(panel).queryAllByRole("switch")).toHaveLength(0);
  });

  it("Licence explains an unconfigured site and offers a way to re-check", async () => {
    const getSpy = vi
      .spyOn(websiteSubscriptionService, "get")
      .mockResolvedValue({ status: "unconfigured" } as Awaited<ReturnType<typeof websiteSubscriptionService.get>>);
    const user = userEvent.setup();
    await renderRoute("/admin/settings");
    await user.click(await screen.findByRole("tab", { name: "Licence" }));

    const panel = await screen.findByRole("tabpanel");
    expect(await within(panel).findByText("No licence configured")).toBeInTheDocument();
    expect(within(panel).getByText(/no platform service is configured/i)).toBeInTheDocument();
    expect(panel.querySelector("img")).not.toBeNull();

    const calls = getSpy.mock.calls.length;
    await user.click(within(panel).getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThan(calls));
    getSpy.mockRestore();
  });

  it("Settings edits the top-up presets as amounts rather than as raw JSON", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/settings");
    await user.click(await screen.findByRole("tab", { name: "Payment" }));

    expect(await screen.findByDisplayValue("10000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50000")).toBeInTheDocument();
    // The rupiah each row means, so the figures are readable at a glance.
    expect(screen.getByText("Rp 10.000")).toBeInTheDocument();
    // The stored `[10000,25000,50000]` is nowhere on screen and nowhere to type.
    expect(screen.queryByDisplayValue("[10000,25000,50000]")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add amount" }));
    expect(screen.getAllByRole("button", { name: /Remove amount/ })).toHaveLength(4);
  });

  it("Settings saves the presets back as the JSON the API stores", async () => {
    const updateSpy = vi.spyOn(settingsService, "update").mockResolvedValue([]);
    const user = userEvent.setup();
    await renderRoute("/admin/settings");
    await user.click(await screen.findByRole("tab", { name: "Payment" }));
    await screen.findByDisplayValue("10000");

    await user.click(screen.getByRole("button", { name: "Remove amount 3" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Yes, Save" }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    const payload = updateSpy.mock.calls[0][0] as Record<string, string>;

    expect(payload.balance_topup_presets).toBe("[10000,25000]");
    // Built from the tab that is on screen, so a group this form does not own
    // cannot travel back with it.
    expect(payload).not.toHaveProperty("is_serving");
    expect(payload).not.toHaveProperty("default_markup_percent");
  });

  it("Settings edits the payment expiry window of each method", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/settings");
    await user.click(await screen.findByRole("tab", { name: "Operational" }));

    // Per method, because they disagree by hours — a virtual account dies in
    // minutes and a convenience store in a day, so one number cannot drive both.
    expect(await screen.findByText("Virtual Account")).toBeInTheDocument();
    expect(screen.getByText("Convenience store")).toBeInTheDocument();
    expect(screen.getByDisplayValue("15")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1445")).toBeInTheDocument();
  });

  it("a boolean setting renders as a switch, not a text field", async () => {
    await renderRoute("/admin/settings");

    expect(await screen.findByRole("switch", { name: "Maintenance Mode" })).toBeInTheDocument();
  });

  // An image setting used to render as the words "No file uploaded." with no
  // way to change it, even though the upload endpoint has always existed.
  it("an image setting offers a real upload control", async () => {
    await renderRoute("/admin/settings");

    expect(await screen.findByText("Logo")).toBeInTheDocument();
    expect(screen.queryByText(/images are managed through the upload endpoint/i)).not.toBeInTheDocument();
    expect(await screen.findByTestId("setting-upload-logo")).toBeInTheDocument();
  });

  it("uploads an image setting through its own endpoint", async () => {
    const uploadSpy = vi.spyOn(settingsService, "upload");
    await renderRoute("/admin/settings");

    const dropzone = await screen.findByTestId("setting-upload-logo");
    const input = dropzone.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["logo"], "logo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledWith("logo", expect.any(File)));
  });
});

describe("marketing routes", () => {
  it("Promo lists codes with their usage and visibility", async () => {
    await renderRoute("/admin/promos");

    expect(await screen.findByRole("heading", { name: "Promo" })).toBeInTheDocument();
    expect(await screen.findByText("HEMAT10")).toBeInTheDocument();
    // Private codes still work when typed — the column has to distinguish them.
    expect(await screen.findByText("Private")).toBeInTheDocument();
  });

  it("Flash Sale shows the running state, not just active/inactive", async () => {
    await renderRoute("/admin/flash-sales");

    expect(await screen.findByRole("heading", { name: "Flash Sale" })).toBeInTheDocument();
    expect(await screen.findByText("Flash Sale Mingguan")).toBeInTheDocument();
    expect(await screen.findByText("Running")).toBeInTheDocument();
  });

  it("the Add Promo form renders its fields", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/promos");

    await user.click(await screen.findByRole("button", { name: "Add Promo" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Add Promo" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Code")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Type")).toBeInTheDocument();
  });
});

describe("content routes — banners and announcements", () => {
  it("Banners lists slides and flags a missing image", async () => {
    await renderRoute("/admin/content/banners");

    expect(await screen.findByRole("heading", { name: "Banners" })).toBeInTheDocument();
    expect(await screen.findByText("Promo Ramadan 2026")).toBeInTheDocument();
  });

  it("Announcements lists notices", async () => {
    await renderRoute("/admin/content/announcements");

    expect(await screen.findByRole("heading", { name: "Announcements" })).toBeInTheDocument();
    expect(await screen.findByText(/Server maintenance terjadwal/)).toBeInTheDocument();
  });
});
