import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderRoute, screen, waitFor } from "@/test/test-utils";
import { useAuthStore } from "@/store/useAuthStore";
import * as providerHooks from "@/features/products/hooks/useProviderProducts";

/**
 * Set Profit Margin (Bulk) page — the selection rides in `?ids=`, and the left
 * column shows each selected provider product's price breakdown.
 */
describe("ProviderMarginBulkPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: "test-token", permissions: ["*"] });
  });

  afterEach(() => {
    useAuthStore.setState({ token: null, permissions: [] });
    vi.restoreAllMocks();
  });

  it("renders the margin form and the selected items", async () => {
    await renderRoute("/admin/products/provider/set-profit-margin?ids=2");

    expect(await screen.findByRole("heading", { name: "Set Profit Margin" })).toBeInTheDocument();
    expect(await screen.findByText("MOBILELEGEND - 19 Diamond")).toBeInTheDocument();
    // One field per membership plan, built from the plans that exist — the
    // four fixed tiers could not describe a plan the admin just created.
    expect(await screen.findByLabelText("Basic (free) margin (%) · default tier")).toBeInTheDocument();
    // Two plans display as "Basic" in production, so the code disambiguates
    // them — otherwise the admin cannot tell which field drives retail price.
    expect(screen.getByLabelText("Basic (basic) margin (%)")).toBeInTheDocument();
    expect(screen.getByLabelText("Gold (gold) margin (%)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("shows loading skeletons while the selected products load", async () => {
    // Pin the list query to its in-flight state — the fake backend resolves on a
    // microtask, so racing the real load is flaky (green locally, red in CI).
    vi.spyOn(providerHooks, "useProviderProductList").mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof providerHooks.useProviderProductList>);

    const { container } = await renderRoute("/admin/products/provider/set-profit-margin?ids=2");

    // The left column shows skeleton cards instead of the empty-state copy, so
    // the admin knows products are still loading rather than absent.
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByText("No selected products to show.")).not.toBeInTheDocument();
  });

  /**
   * The bug this page was reported for: margins saved, nothing on screen
   * changed. The prices come from the API's plan-keyed preview, and the page
   * has to stay put after saving for the admin to see them at all.
   */
  it("shows the projected price for every plan on a pooled row", async () => {
    await renderRoute("/admin/products/provider/set-profit-margin?ids=4");

    expect(await screen.findByText("Valorant 420 Points")).toBeInTheDocument();
    // 50.000 cost at the seeded margins — not the Rp 0 / -100% the missing
    // preview used to render.
    expect(await screen.findByText("Rp 60.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 52.500")).toBeInTheDocument();
  });

  it("prefills the margins and points already saved on the selection", async () => {
    await renderRoute("/admin/products/provider/set-profit-margin?ids=4");

    // The numeric fields are text inputs now (digit/decimal-only), so the DOM
    // value reads back as a string.
    expect(await screen.findByLabelText("Basic (free) margin (%) · default tier")).toHaveValue("20");
    expect(screen.getByLabelText("Gold (gold) margin (%)")).toHaveValue("5");
    expect(screen.getByLabelText("Points (%)")).toHaveValue("2.5");
    expect(screen.getByLabelText("Bonus Points")).toHaveValue("50");
  });

  it("saves the points alongside the margins and stays on the page", async () => {
    const user = userEvent.setup();
    await renderRoute("/admin/products/provider/set-profit-margin?ids=4");

    const points = await screen.findByLabelText("Points (%)");
    await user.clear(points);
    await user.type(points, "3");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Still here — navigating away is what hid the result from the admin.
    await waitFor(() => expect(screen.getByLabelText("Points (%)")).toHaveValue("3"));
    expect(screen.getByRole("heading", { name: "Set Profit Margin" })).toBeInTheDocument();
  });

  it("has nothing to save with an empty selection", async () => {
    await renderRoute("/admin/products/provider/set-profit-margin");

    expect(await screen.findByRole("heading", { name: "Set Profit Margin" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
