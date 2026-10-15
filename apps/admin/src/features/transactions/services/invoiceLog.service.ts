import { api } from "@/lib/axios";
import { API_VERSION } from "@/config/env";
import { toRowId, unwrapPaginated } from "@/lib/apiMappers";
import type { ApiResponse, PaginatedResponse } from "@/types/api.type";
import type {
  InvoiceDeliveryChannel,
  InvoiceDeliveryLog,
  InvoiceDeliveryStatus,
  InvoiceLogListParams,
} from "../types/invoiceLog.type";

/**
 * Data layer for the invoice-delivery trail (`GET /v1/invoice-logs`). Read-only:
 * rows are written by the sending jobs on the backend, never from the admin.
 */
const BASE = `${API_VERSION}/invoice-logs`;

interface InvoiceLogApiRow {
  id: number;
  transaction_id: number;
  invoice_number: string | null;
  channel: string;
  recipient: string | null;
  status: string;
  reason: string | null;
  is_resend: boolean;
  attempted_at: string | null;
}

const toInvoiceLog = (row: InvoiceLogApiRow): InvoiceDeliveryLog => ({
  id: toRowId(row.id),
  transactionId: toRowId(row.transaction_id),
  invoiceNumber: row.invoice_number ?? undefined,
  channel: row.channel as InvoiceDeliveryChannel,
  recipient: row.recipient ?? undefined,
  status: row.status as InvoiceDeliveryStatus,
  reason: row.reason ?? undefined,
  isResend: row.is_resend,
  attemptedAt: row.attempted_at ?? "",
});

export const invoiceLogService = {
  list: async (params: InvoiceLogListParams = {}): Promise<PaginatedResponse<InvoiceDeliveryLog>> => {
    const response: ApiResponse<PaginatedResponse<InvoiceLogApiRow>> = await api.get(BASE, { params });
    return unwrapPaginated(response, toInvoiceLog);
  },
};
