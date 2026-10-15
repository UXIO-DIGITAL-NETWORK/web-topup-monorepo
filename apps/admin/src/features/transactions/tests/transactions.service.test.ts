import { describe, it, expect, vi, beforeEach } from "vitest";

import { api } from "@/lib/axios";
import { envelope, paginated } from "@/test/apiEnvelope";
import { transactionsService } from "../services/transactions.service";

vi.mock("@/lib/axios", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const apiRow = (over: Record<string, unknown> = {}) => ({
  id: 1,
  invoice_number: "ZP2607016UJFJVSHCJ",
  user_id: 1001,
  guest_contact: null,
  target_uid: "1453734692",
  target_server: "16057",
  amount_fee: 0,
  amount_total: 4752,
  margin: 47,
  status: "COMPLETED",
  sn: "SN-123",
  proof_url: null,
  user: { id: 1001, name: "Randy Galang", phone: "+629876543210", avatar_url: null },
  product: { id: 9, name: "19 Diamond", category: { id: 4, name: "Mobile Legends" } },
  payment: { status: "3" },
  payment_channel: { id: 2, name: "Credits" },
  created_at: "2026-07-01T14:56:37.000Z",
  updated_at: "2026-07-01T14:58:00.000Z",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("transactionsService.list", () => {
  it("maps the API row onto the feature's transaction shape", async () => {
    vi.mocked(api.get).mockResolvedValue(paginated([apiRow()]));

    const result = await transactionsService.list({});

    expect(result.data[0]).toMatchObject({
      id: "1",
      invoice_no: "ZP2607016UJFJVSHCJ",
      invoice_status: "success",
      payment_status: "success",
      cost: 4752,
      profit: 47,
      payment_method: "Credits",
      target_ref: "1453734692 / 16057",
    });
    expect(result.data[0].customer).toMatchObject({ name: "Randy Galang", user_id: 1001 });
    expect(result.data[0].game.name).toBe("Mobile Legends");
  });

  it("carries the checked username through as the nickname", async () => {
    vi.mocked(api.get).mockResolvedValue(paginated([apiRow({ target_nickname: "ProPlayerFF" })]));

    const result = await transactionsService.list({});

    expect(result.data[0].nickname).toBe("ProPlayerFF");
  });

  // PAID means the customer has paid but the supplier has not started, which
  // is exactly what the Pending pill means to an operator.
  it("folds PAID into pending and EXPIRED into failed", async () => {
    vi.mocked(api.get).mockResolvedValue(paginated([apiRow({ status: "PAID" }), apiRow({ id: 2, status: "EXPIRED" })]));

    const result = await transactionsService.list({});

    expect(result.data[0].invoice_status).toBe("pending");
    expect(result.data[1].invoice_status).toBe("failed");
  });

  it("reads both lifecycles from the split-aware API", async () => {
    vi.mocked(api.get).mockResolvedValue(
      paginated([
        apiRow({
          status: "FAILED_PROVIDER",
          payment_status: "SUCCESS",
          provider_status: "UNDELIVERED",
        }),
      ]),
    );

    const result = await transactionsService.list({});

    // Paid, yet the supplier never came back to us — two facts one column
    // could not hold at the same time.
    expect(result.data[0].payment_status).toBe("success");
    expect(result.data[0].provider_status).toBe("undelivered");
  });

  /**
   * The three repos deploy independently, so this page has to render correctly
   * against an API that has not shipped the split yet.
   */
  it("falls back to the old fields when the API predates the split", async () => {
    vi.mocked(api.get).mockResolvedValue(
      paginated([apiRow({ status: "COMPLETED", payment: { status: "3" } })]),
    );

    const result = await transactionsService.list({});

    expect(result.data[0].payment_status).toBe("success");
    expect(result.data[0].provider_status).toBe("delivered");
  });

  it("sends the payment and provider filters the API can now receive", async () => {
    vi.mocked(api.get).mockResolvedValue(paginated([]));

    // The Payment Status dropdown has existed for a while but was never
    // serialized — picking a value changed local state and nothing else.
    await transactionsService.list({ paymentStatus: "success", providerStatus: "unconfirmed" });

    expect(vi.mocked(api.get).mock.calls[0][1]?.params).toMatchObject({
      payment_status: "SUCCESS",
      provider_status: "UNCONFIRMED",
    });
  });

  it("asks for orders with no gateway at all", async () => {
    vi.mocked(api.get).mockResolvedValue(paginated([]));

    await transactionsService.list({ paymentStatus: "none" });

    expect(vi.mocked(api.get).mock.calls[0][1]?.params).toMatchObject({ payment_status: "NONE" });
  });

  it("names a guest from the transaction's own contact, since there is no user row", async () => {
    vi.mocked(api.get).mockResolvedValue(
      paginated([apiRow({ user: null, user_id: null, guest_contact: "+628111222333" })]),
    );

    const result = await transactionsService.list({});

    expect(result.data[0].customer).toMatchObject({ user_id: null, name: "Guest", phone: "+628111222333" });
  });

  it("translates the filter bar's camelCase params into the API's snake_case", async () => {
    vi.mocked(api.get).mockResolvedValue(paginated([]));

    await transactionsService.list({ userId: "5", invoiceStatus: "success", startDate: "2026-07-01", page: 2 });

    expect(vi.mocked(api.get).mock.calls[0][1]?.params).toMatchObject({
      user_id: "5",
      status: "COMPLETED",
      start_date: "2026-07-01",
      page: 2,
    });
  });

  /**
   * The backend only sorts by columns it has whitelisted. Passing a joined
   * column through would silently sort by created_at instead, which reads as
   * a broken header rather than an unsupported one.
   */
  it("drops a sort on a column the API cannot sort by", async () => {
    vi.mocked(api.get).mockResolvedValue(paginated([]));

    await transactionsService.list({ sortBy: "user", sortDir: "asc" });

    expect(vi.mocked(api.get).mock.calls[0][1]?.params).not.toHaveProperty("sort_by");
  });

  it("maps a sortable column onto its API column name", async () => {
    vi.mocked(api.get).mockResolvedValue(paginated([]));

    await transactionsService.list({ sortBy: "cost", sortDir: "desc" });

    expect(vi.mocked(api.get).mock.calls[0][1]?.params).toMatchObject({ sort_by: "amount_total", sort_dir: "desc" });
  });

  it("maps the customer email from the user, falling back to the checkout contact_email", async () => {
    vi.mocked(api.get).mockResolvedValue(
      paginated([apiRow({ user: { id: 1001, name: "Randy", phone: "p", email: "user@example.com", avatar_url: null } })]),
    );
    expect((await transactionsService.list({})).data[0].customer.email).toBe("user@example.com");

    vi.mocked(api.get).mockResolvedValue(
      paginated([apiRow({ user: null, user_id: null, contact_email: "guest@example.com" })]),
    );
    expect((await transactionsService.list({})).data[0].customer.email).toBe("guest@example.com");
  });
});

describe("transactionsService.getById", () => {
  it("fetches by id directly when the ref is numeric", async () => {
    vi.mocked(api.get).mockResolvedValue(envelope(apiRow()));

    await transactionsService.getById("1");

    expect(api.get).toHaveBeenCalledWith("/v1/transactions/1");
  });

  // The edit route is keyed on the invoice number, but the API binds the
  // numeric id — so a non-numeric ref has to be resolved through search.
  it("resolves an invoice number through a search instead of 404ing", async () => {
    vi.mocked(api.get).mockResolvedValue(paginated([apiRow()]));

    const result = await transactionsService.getById("ZP2607016UJFJVSHCJ");

    expect(api.get).toHaveBeenCalledWith("/v1/transactions", {
      params: { search: "ZP2607016UJFJVSHCJ", per_page: 1 },
    });
    expect(result.invoice_no).toBe("ZP2607016UJFJVSHCJ");
  });

  it("throws when an invoice number matches nothing", async () => {
    vi.mocked(api.get).mockResolvedValue(paginated([]));

    await expect(transactionsService.getById("NOPE")).rejects.toThrow();
  });
});

describe("transactionsService.getStatusCounts", () => {
  it("renames the API's failed_provider onto the pill's key", async () => {
    vi.mocked(api.get).mockResolvedValue(
      envelope({ pending: 12, processing: 32, completed: 45, failed_provider: 8 }),
    );

    await expect(transactionsService.getStatusCounts()).resolves.toEqual({
      pending: 12,
      processing: 32,
      completed: 45,
      failed: 8,
    });
  });
});

describe("transactionsService actions", () => {
  it("refund requires a reason and posts it", async () => {
    vi.mocked(api.post).mockResolvedValue(envelope(null));

    await expect(transactionsService.refund("1", "   ")).rejects.toThrow("A refund reason is required");

    await transactionsService.refund("1", "duplicate order");
    expect(api.post).toHaveBeenCalledWith("/v1/transactions/1/refund", { reason: "duplicate order" });
  });

  it("resendCallback, retryInvoice and resendReceipt hit their own endpoints", async () => {
    vi.mocked(api.post).mockResolvedValue(envelope(null));

    await transactionsService.resendCallback("1");
    await transactionsService.retryInvoice("1");
    await transactionsService.resendReceipt("1");

    expect(api.post).toHaveBeenCalledWith("/v1/transactions/1/resend-callback");
    expect(api.post).toHaveBeenCalledWith("/v1/transactions/1/retry");
    expect(api.post).toHaveBeenCalledWith("/v1/transactions/1/resend-receipt");
  });

  it("exportTransactions requests a CSV blob for the filtered set, without pagination", async () => {
    vi.mocked(api.get).mockResolvedValue(new Blob(["a,b"], { type: "text/csv" }));

    await transactionsService.exportTransactions({ search: "foo", invoiceStatus: "pending", page: 2, per_page: 10 });

    const call = vi.mocked(api.get).mock.calls.at(-1);
    expect(call?.[0]).toBe("/v1/transactions/export");
    expect(call?.[1]?.responseType).toBe("blob");
    expect(call?.[1]?.params).toMatchObject({ format: "csv", search: "foo", status: "PENDING" });
    expect(call?.[1]?.params).not.toHaveProperty("page");
    expect(call?.[1]?.params).not.toHaveProperty("per_page");
  });

  it("getRecap maps the breakdown and derives totals when the API omits them", async () => {
    vi.mocked(api.get).mockResolvedValue(
      envelope({
        generated_at: "2026-07-01T00:00:00.000Z",
        breakdown: [
          { label: "ML", count: 2, revenue: 1000 },
          { label: "FF", count: 3, revenue: 2000 },
        ],
      }),
    );

    const recap = await transactionsService.getRecap("monthly");

    const call = vi.mocked(api.get).mock.calls.at(-1);
    expect(call?.[0]).toBe("/v1/transactions/recap");
    expect(call?.[1]?.params).toMatchObject({ period: "monthly" });
    expect(recap.rows).toHaveLength(2);
    expect(recap.totals).toEqual({ count: 5, revenue: 3000 });
  });

  it("remove deletes by id", async () => {
    vi.mocked(api.delete).mockResolvedValue(envelope(null));

    await expect(transactionsService.remove("1")).resolves.toBeUndefined();
    expect(api.delete).toHaveBeenCalledWith("/v1/transactions/1");
  });
});

describe("transactionsService.edit", () => {
  // The API marks amount_base and status required on update, so the edit
  // form's three fields alone would 422.
  it("merges the form's fields onto the current row before writing", async () => {
    vi.mocked(api.get).mockResolvedValue(envelope(apiRow()));
    vi.mocked(api.put).mockResolvedValue(envelope(apiRow({ status: "PROCESSING" })));

    const form = new FormData();
    form.append("invoiceStatus", "processing");
    form.append("serialNumber", "SN-999");

    await transactionsService.edit("1", form);

    expect(api.put).toHaveBeenCalledWith("/v1/transactions/1", {
      amount_base: 4752,
      amount_fee: 0,
      amount_total: 4752,
      status: "PROCESSING",
      sn: "SN-999",
    });
  });
});

/**
 * `getDetail` backs the read-only Transaction Detail dialog. It reads the same
 * endpoint as `getById` but keeps the wider payload the list row throws away.
 *
 * Cases:
 * - fetches by id for a numeric ref, and falls back to the invoice search
 *   (parity with getById — proves the shared ref-resolution still works)
 * - throws when an invoice number matches nothing
 * - maps product.category onto game.name (the field that was silently blank
 *   until the API started eager-loading the relation)
 * - guests, and a row with no payment yet, map without throwing
 * - status folding still applies, so the shared helper really is shared
 * - total_price is never mapped: the API writes it only for admin-created
 *   rows, so it is 0 on every customer order and would render as a lie
 */
const detailRow = (over: Record<string, unknown> = {}) => ({
  ...apiRow(),
  amount_base: 4000,
  channel_fee: 752,
  discount_amount: 0,
  total_price: 0,
  is_manual: false,
  supplier_trx_id: "SUP-77",
  supplier_status: "success",
  supplier: { id: 3, name: "Uxiolabs" },
  payment: {
    status: "3",
    reference_id: "PAY-REF-01",
    pg_transaction_id: "PG-9",
    gross_amount: 4752,
    paid_at: "2026-07-01T14:57:00.000Z",
  },
  ...over,
});

describe("transactionsService.getDetail", () => {
  it("fetches by id directly when the ref is numeric", async () => {
    vi.mocked(api.get).mockResolvedValue(envelope(detailRow()));

    const result = await transactionsService.getDetail("1");

    expect(api.get).toHaveBeenCalledWith("/v1/transactions/1");
    expect(result).toMatchObject({
      invoice_no: "ZP2607016UJFJVSHCJ",
      amount_base: 4000,
      channel_fee: 752,
      amount_fee: 0,
      amount_total: 4752,
      margin: 47,
      is_manual: false,
      serial_number: "SN-123",
    });
  });

  it("resolves an invoice number through a search instead of 404ing", async () => {
    vi.mocked(api.get).mockResolvedValue(paginated([detailRow()]));

    const result = await transactionsService.getDetail("ZP2607016UJFJVSHCJ");

    expect(api.get).toHaveBeenCalledWith("/v1/transactions", {
      params: { search: "ZP2607016UJFJVSHCJ", per_page: 1 },
    });
    expect(result.invoice_no).toBe("ZP2607016UJFJVSHCJ");
  });

  it("throws when an invoice number matches nothing", async () => {
    vi.mocked(api.get).mockResolvedValue(paginated([]));

    await expect(transactionsService.getDetail("NOPE")).rejects.toThrow();
  });

  // The API omits `category` unless the relation is eager-loaded, which is
  // why this rendered as an empty Game cell for as long as it did.
  it("maps the product's category onto the game name", async () => {
    vi.mocked(api.get).mockResolvedValue(envelope(detailRow()));

    const result = await transactionsService.getDetail("1");

    expect(result.game).toEqual({ id: "4", name: "Mobile Legends" });
  });

  it("falls back to the guest contact when there is no user row", async () => {
    vi.mocked(api.get).mockResolvedValue(
      envelope(
        detailRow({
          user: null,
          user_id: null,
          guest_contact: "6281234567890",
          contact_email: "guest@example.com",
        }),
      ),
    );

    const result = await transactionsService.getDetail("1");

    expect(result.customer).toMatchObject({
      user_id: null,
      name: "Guest",
      phone: "6281234567890",
      email: "guest@example.com",
    });
  });

  it("distinguishes an order with no gateway from one merely awaiting payment", async () => {
    vi.mocked(api.get).mockResolvedValue(envelope(detailRow({ payment: null, status: "PENDING" })));

    const result = await transactionsService.getDetail("1");

    // Not "pending": an admin-created or manually recorded order never went
    // through a gateway at all, and folding that into "unpaid" is what made the
    // Manual tab's payment column meaningless.
    expect(result.payment_status).toBe("none");
    expect(result.payment).toEqual({
      reference_id: undefined,
      pg_transaction_id: undefined,
      gross_amount: undefined,
      paid_at: undefined,
    });
  });

  it("folds PAID into pending in the detail mapper too", async () => {
    vi.mocked(api.get).mockResolvedValue(envelope(detailRow({ status: "PAID" })));

    await expect(transactionsService.getDetail("1")).resolves.toMatchObject({ invoice_status: "pending" });
  });

  it("carries the manual flag", async () => {
    vi.mocked(api.get).mockResolvedValue(envelope(detailRow({ is_manual: true })));

    await expect(transactionsService.getDetail("1")).resolves.toMatchObject({ is_manual: true });
  });

  // `total_price` is written only by admin-created rows; CheckoutAction never
  // sets it, so it is 0 on every customer order. Mapping it would put a
  // permanent "Rp 0" on the dialog.
  it("never maps total_price", async () => {
    vi.mocked(api.get).mockResolvedValue(envelope(detailRow({ total_price: 999 })));

    const result = await transactionsService.getDetail("1");

    expect(result).not.toHaveProperty("total_price");
  });
});
