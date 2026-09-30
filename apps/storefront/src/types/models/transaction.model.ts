/**
 * `App\Enums\TransactionStatus` — the exact uppercase strings the API stores
 * and returns. Never compare against lowercase variants.
 */
export type TransactionStatus =
  | "PENDING"
  | "PAID"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED_PROVIDER"
  | "EXPIRED"
  | "REFUNDED";

/**
 * Statuses after which nothing more will change, so invoice polling stops.
 * Kept in sync with `ShowInvoiceAction::TERMINAL_STATUSES`.
 */
export const TERMINAL_TRANSACTION_STATUSES: readonly TransactionStatus[] = [
  "COMPLETED",
  "FAILED_PROVIDER",
  "EXPIRED",
  "REFUNDED",
] as const;

export type PaymentType =
  | "virtual_account"
  | "qris"
  | "ewallet"
  | "convenience_store"
  | "payment_link";

/**
 * Instructions the customer pays against, persisted at checkout so a page
 * refresh still renders them. Which fields are present depends on the channel.
 */
export interface PaymentInstructions {
  order_no?: string;
  qr_string?: string;
  virtual_account?: string;
  bank_code?: string;
  checkout_url?: string;
  is_single_use?: boolean;
}

/** `GET /v1/invoices/{invoice_number}`. */
export interface InvoiceModel {
  invoice_number: string;
  status: TransactionStatus;
  /** True once the status can no longer change — the poll should stop. */
  is_terminal: boolean;
  game: {
    name: string;
    slug: string;
    region: string | null;
    logo_url: string | null;
    thumbnail_url: string | null;
  } | null;
  product: { name: string | null };
  /**
   * One entry per supplier order. Absent on an API that predates the mix
   * feature, one entry for an ordinary product, several for a mix — where the
   * order is delivered in parts and a single status line would be a half-truth.
   * No supplier id and no cost: this endpoint is public.
   */
  components?: { name: string | null; status: string; sn: string | null }[];
  target: {
    uid: string | null;
    server: string | null;
    nickname: string | null;
  };
  amount: { base: number; fee: number; admin_fee: number; total: number };
  /**
   * Loyalty points for this order. Optional because the three repos deploy
   * independently — an API that predates this block must not break the page.
   *
   * `earned` is a projection while `is_estimate` is true and the granted figure
   * once it is false; `eligible` is false for a guest order, which earns none.
   */
  points?: { earned: number; is_estimate: boolean; eligible: boolean };
  payment: {
    channel: string | null;
    channel_code: string | null;
    type: PaymentType | null;
    reference_id: string | null;
    status: string | null;
    paid_at: string | null;
    instructions: PaymentInstructions | null;
  };
  /**
   * Present only once a refund exists for this order. Deliberately narrow: the
   * endpoint is unauthenticated, so it never carries the claim token, the
   * contact details, or anything about the merchant. `method` is what decides
   * between "already in your balance" and "claim your refund".
   */
  refund: {
    status: "WAITING_ACCOUNT" | "WAITING_DETAILS" | "PENDING" | "PROCESSING" | "COMPLETED" | "REJECTED";
    method: "balance" | "balance_claim" | "manual_transfer" | "legacy_gateway";
    amount: number;
    refunded_at: string | null;
  } | null;
  /** Drives the countdown; null when the channel has no configured window. */
  expires_at: string | null;
  /** Voucher / serial number, present once the supplier has fulfilled. */
  sn: string | null;
  created_at: string;
}

/** A row from `GET /v1/me/transactions` or `GET /v1/orders/track`. */
export interface TransactionSummaryModel {
  id?: number;
  invoice_number: string;
  service_name?: string | null;
  service_detail?: string | null;
  service?: string | null;
  target?: string;
  target_nickname?: string | null;
  amount: number;
  /** Fee breakdown (present on member/track lists); optional for older shapes. */
  base?: number;
  admin_fee?: number;
  status: TransactionStatus;
  payment_method?: PaymentType | null;
  payment_channel?: string | null;
  game_id?: number | null;
  game_name?: string | null;
  game_slug?: string | null;
  game_logo_url?: string | null;
  sn?: string | null;
  created_at: string;
}
