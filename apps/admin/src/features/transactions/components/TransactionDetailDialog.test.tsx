import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { TransactionDetailDialog } from "./TransactionDetailDialog";
import * as hooks from "../hooks/useTransactions";
import type { TransactionDetail } from "../types/transaction.type";

/**
 * Cases:
 * - renders the six field groups of a fully-populated transaction
 * - hides Channel Fee when it equals the fee (identical on every modern row)
 *   and shows it when a legacy markup row differs
 * - hides Gateway Amount unless it disagrees with the total (a real
 *   reconciliation discrepancy); hides Promo Discount when there is none
 * - a guest order renders "Guest" and the guest contact, no account id
 * - an unpaid order renders "Not paid" instead of crashing on a null payment
 * - margin colour follows its sign
 * - loading renders skeletons; error keeps the DialogHeader mounted (it
 *   supplies the accessible name) and offers Retry
 * - the payment-proof row only exists when there is a proof
 */
const detail: TransactionDetail = {
  id: "1",
  invoice_no: "ZP2607016UJFJVSHCJ",
  invoice_status: "success",
  payment_status: "success",
  provider_status: "delivered",
  is_manual: false,
  customer: { user_id: 1001, name: "Randy Galang", phone: "+629876543210", email: "randy@example.com" },
  game: { id: "4", name: "Mobile Legends" },
  product: { id: "9", name: "19 Diamond" },
  target_ref: "1453734692 / 16057",
  target_uid: "1453734692",
  target_server: "16057",
  nickname: "ProPlayerFF",
  serial_number: "SN-123",
  proof_url: undefined,
  amount_base: 4000,
  discount_amount: 0,
  amount_fee: 752,
  channel_fee: 752,
  amount_total: 4752,
  margin: 47,
  payment_method: "QRIS",
  payment: {
    reference_id: "PAY-REF-01",
    pg_transaction_id: "PG-9",
    gross_amount: 4752,
    paid_at: "2026-07-01T14:57:00.000Z",
  },
  supplier: { name: "Uxiolabs", trx_id: "SUP-77", status: "success" },
  created_at: "2026-07-01T14:56:37.000Z",
  updated_at: "2026-07-01T14:58:00.000Z",
};

const refetch = vi.fn();

const mockDetail = (over: Partial<ReturnType<typeof hooks.useTransactionDetail>> = {}, data = detail) =>
  vi.spyOn(hooks, "useTransactionDetail").mockReturnValue({
    data,
    isPending: false,
    isError: false,
    refetch,
    ...over,
  } as unknown as ReturnType<typeof hooks.useTransactionDetail>);

const renderDialog = () =>
  render(
    <TransactionDetailDialog
      transactionId="1"
      open
      onOpenChange={vi.fn()}
    />,
  );

beforeEach(() => vi.clearAllMocks());

describe("TransactionDetailDialog", () => {
  it("renders every field group of a populated transaction", () => {
    mockDetail();
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Transaction Detail" });
    for (const caption of ["Customer", "Order", "Payment", "Supplier", "Timing"]) {
      expect(within(dialog).getByText(caption)).toBeInTheDocument();
    }

    expect(within(dialog).getByText("ZP2607016UJFJVSHCJ")).toBeInTheDocument();
    expect(within(dialog).getByText("Mobile Legends")).toBeInTheDocument();
    expect(within(dialog).getByText("19 Diamond")).toBeInTheDocument();
    expect(within(dialog).getByText("ProPlayerFF")).toBeInTheDocument();
    expect(within(dialog).getByText("SN-123")).toBeInTheDocument();
    expect(within(dialog).getByText("Uxiolabs")).toBeInTheDocument();
    expect(within(dialog).getByText("SUP-77")).toBeInTheDocument();
    expect(within(dialog).getByText("PAY-REF-01")).toBeInTheDocument();
    expect(within(dialog).getByText("QRIS")).toBeInTheDocument();
    expect(within(dialog).getByText("Automatic")).toBeInTheDocument();
  });

  // amount_fee and channel_fee are the same number on every row written since
  // the global markup was removed — showing both reads as double counting.
  it("hides the channel fee when it matches the fee, and shows it when it differs", () => {
    mockDetail();
    const { unmount } = renderDialog();
    expect(screen.queryByText("Channel Fee")).not.toBeInTheDocument();
    unmount();

    mockDetail({}, { ...detail, channel_fee: 500 });
    renderDialog();
    expect(screen.getByText("Channel Fee")).toBeInTheDocument();
  });

  it("shows the gateway amount only when it disagrees with the total", () => {
    mockDetail();
    const { unmount } = renderDialog();
    expect(screen.queryByText("Gateway Amount")).not.toBeInTheDocument();
    unmount();

    mockDetail({}, { ...detail, payment: { ...detail.payment, gross_amount: 5000 } });
    renderDialog();
    expect(screen.getByText("Gateway Amount")).toBeInTheDocument();
  });

  it("shows the promo discount only when there is one", () => {
    mockDetail();
    const { unmount } = renderDialog();
    expect(screen.queryByText("Promo Discount")).not.toBeInTheDocument();
    unmount();

    mockDetail({}, { ...detail, discount_amount: 1000 });
    renderDialog();
    expect(screen.getByText("Promo Discount")).toBeInTheDocument();
  });

  it("renders a guest order without an account id", () => {
    mockDetail(
      {},
      {
        ...detail,
        customer: { user_id: null, name: "Guest", phone: "6281234567890", email: undefined },
      },
    );
    renderDialog();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Guest")).toBeInTheDocument();
    expect(within(dialog).getByText("6281234567890")).toBeInTheDocument();
    expect(within(dialog).getByText("Guest checkout")).toBeInTheDocument();
  });

  it("renders an unpaid order as Not paid", () => {
    mockDetail({}, { ...detail, payment_status: "pending", payment: {} });
    renderDialog();

    expect(screen.getByText("Not paid")).toBeInTheDocument();
  });

  it("colours the margin by its sign", () => {
    mockDetail({}, { ...detail, margin: -500 });
    const { unmount } = renderDialog();
    expect(screen.getByTestId("detail-margin").className).toContain("text-destructive");
    unmount();

    mockDetail();
    renderDialog();
    expect(screen.getByTestId("detail-margin").className).toContain("text-success");
  });

  it("renders skeletons while loading", () => {
    mockDetail({ isPending: true, data: undefined } as never);
    renderDialog();

    expect(screen.queryByText("Mobile Legends")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Transaction Detail" })).toBeInTheDocument();
  });

  // The DialogHeader supplies the dialog's accessible name, so an error must
  // render inline rather than replacing the whole body.
  it("keeps the header mounted on error and offers a retry", () => {
    mockDetail({ isError: true, data: undefined } as never);
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Transaction Detail" })).toBeInTheDocument();
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it("only offers the payment proof when one exists", () => {
    mockDetail();
    const { unmount } = renderDialog();
    expect(screen.queryByText("Payment Proof")).not.toBeInTheDocument();
    unmount();

    mockDetail({}, { ...detail, proof_url: "https://cdn.example/proof.webp" });
    renderDialog();
    expect(screen.getByRole("link", { name: "View proof" })).toBeInTheDocument();
  });

  it("lists every supplier order of a mix in the Item Transaksi table", () => {
    vi.spyOn(hooks, "useResendSupplierOrderCallback").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);

    mockDetail(
      {},
      {
        ...detail,
        invoice_status: "processing",
        supplier: {
          ...detail.supplier,
          orders: [
            {
              id: "1",
              code: "ML5",
              name: "Mobile Legends 5 Diamond",
              supplier: "Uxiolabs",
              idtrx: "INV-1-42-1",
              provider_status: "delivered",
              sn: "SN-A",
              created_at: "2026-07-01T14:56:37.000Z",
              updated_at: "2026-07-01T14:57:00.000Z",
              retried_by: "Randy",
            },
            {
              id: "2",
              code: "ML10",
              name: "Mobile Legends 10 Diamond",
              supplier: "Uxiolabs",
              idtrx: "INV-1-43-1",
              provider_status: "ordered",
              created_at: "2026-07-01T14:56:37.000Z",
              updated_at: "2026-07-01T14:56:40.000Z",
            },
          ],
        },
      },
    );

    renderDialog();

    expect(screen.getByText("Transaction Items")).toBeInTheDocument();
    expect(screen.getByText("INV-1-42-1")).toBeInTheDocument();
    expect(screen.getByText("INV-1-43-1")).toBeInTheDocument();
    expect(screen.getByText("SN-A")).toBeInTheDocument();
    expect(screen.getByText("Randy")).toBeInTheDocument();
    // One rehit action per part.
    expect(screen.getAllByRole("button", { name: /Rehit/ }).length).toBe(2);
  });
});
