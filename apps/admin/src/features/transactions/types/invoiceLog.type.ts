/** How an invoice delivery attempt ended. */
export type InvoiceDeliveryStatus = "sent" | "failed" | "skipped";

/** Which pipe carried — or was meant to carry — the receipt. */
export type InvoiceDeliveryChannel = "email" | "whatsapp";

/**
 * One attempt to deliver an order's invoice to the buyer.
 *
 * `skipped` is a real outcome, not a gap: a guest with no phone number, or
 * WhatsApp switched off, is recorded with the reason attached.
 */
export interface InvoiceDeliveryLog {
  id: string;
  transactionId: string;
  invoiceNumber?: string;
  channel: InvoiceDeliveryChannel;
  recipient?: string;
  status: InvoiceDeliveryStatus;
  /** The gateway's own words on failure, or why the attempt was skipped. */
  reason?: string;
  /** True when an admin re-sent it by hand. */
  isResend: boolean;
  attemptedAt: string;
}

export interface InvoiceLogListParams {
  search?: string;
  channel?: InvoiceDeliveryChannel;
  status?: InvoiceDeliveryStatus;
  page?: number;
  per_page?: number;
}
