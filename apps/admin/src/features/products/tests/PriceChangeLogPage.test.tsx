import { describe, it, expect, afterEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";

import { renderRoute, screen } from "@/test/test-utils";
import { priceChangeLogService } from "../services/priceChangeLog.service";
import type { PriceChangeLog } from "../types/product.type";
import type { PaginatedResponse } from "@/types/api.type";

const LIST_PATH = "/admin/products-preview/price-log";

const pair = (oldValue: number | null, newValue: number | null) => ({ old: oldValue, new: newValue });

const applied: PriceChangeLog = {
  id: "1",
  supplier_product_id: 10,
  product_id: 7,
  buyer_sku_code: "ML5",
  product_name: "Mobile Legends 5 Diamond",
  status: "applied",
  source: "sweep",
  needs_attention: false,
  reason: "Harga jual diperbarui otomatis dari aturan margin.",
  old_cost: 10000,
  new_cost: 12000,
  prices: {
    member: pair(12000, 14400),
    vip: pair(11500, 13800),
    reseller: pair(11000, 13200),
    agent: pair(10500, 12600),
  },
  created_at: "2026-08-25T03:10:00.000000Z",
};

const deactivated: PriceChangeLog = {
  id: "2",
  supplier_product_id: 11,
  product_id: 8,
  buyer_sku_code: "FF100",
  product_name: "Free Fire 100 Diamond",
  status: "deactivated",
  source: "checkout",
  needs_attention: true,
  reason: "SKU dinonaktifkan di provider — perlu perhatian admin.",
  old_cost: 8000,
  new_cost: 8000,
  prices: {
    member: pair(9600, null),
    vip: pair(9200, null),
    reseller: pair(8800, null),
    agent: pair(8400, null),
  },
  created_at: "2026-08-25T03:10:00.000000Z",
};

const page = (rows: PriceChangeLog[]): PaginatedResponse<PriceChangeLog> => ({
  data: rows,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: 1, from: 1, last_page: 1, path: "", per_page: 20, to: rows.length, total: rows.length },
});

/**
 * The Price Change Log tab: the admin's read-only window into what the 5-minute
 * checker auto-repriced and, crucially, which rows need handling.
 */
describe("PriceChangeLogPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appears as a tab and in the breadcrumb", async () => {
    vi.spyOn(priceChangeLogService, "list").mockResolvedValue(page([applied]));
    await renderRoute(LIST_PATH);

    const tab = await screen.findByRole("tab", { name: "Price Change Log" });
    expect(tab).toHaveAttribute("href", "/admin/products-preview/price-log");
    const breadcrumb = await screen.findByRole("navigation", { name: "breadcrumb" });
    expect(breadcrumb).toHaveTextContent(/Price Change Log/);
  });

  it("shows a repriced row with the old → new selling price", async () => {
    vi.spyOn(priceChangeLogService, "list").mockResolvedValue(page([applied]));
    await renderRoute(LIST_PATH);

    expect(await screen.findByText("Mobile Legends 5 Diamond")).toBeInTheDocument();
    // Old cost (unique) and the new member price (unique) both render.
    expect(screen.getByText("Rp 10.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 14.400")).toBeInTheDocument();
    expect(screen.getAllByText("Repriced").length).toBeGreaterThan(0);
  });

  it("flags a deactivated row as needing attention", async () => {
    vi.spyOn(priceChangeLogService, "list").mockResolvedValue(page([deactivated]));
    await renderRoute(LIST_PATH);

    expect(await screen.findByText("Free Fire 100 Diamond")).toBeInTheDocument();
    expect(screen.getByText("Deactivated")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
  });

  it("shows which path noticed the change", async () => {
    vi.spyOn(priceChangeLogService, "list").mockResolvedValue(page([applied, deactivated]));
    await renderRoute(LIST_PATH);

    // The scheduled sweep's row, and the one a buyer's pre-payment check produced.
    expect(await screen.findByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("Checkout")).toBeInTheDocument();
  });

  it("filters by status", async () => {
    const listSpy = vi.spyOn(priceChangeLogService, "list").mockResolvedValue(page([applied, deactivated]));
    const user = userEvent.setup();
    await renderRoute(LIST_PATH);

    await screen.findByText("Mobile Legends 5 Diamond");

    await user.click(await screen.findByLabelText("Filter by status"));
    await user.click(await screen.findByRole("option", { name: "Deactivated" }));

    await waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ status: "deactivated" })),
    );
  });
});
