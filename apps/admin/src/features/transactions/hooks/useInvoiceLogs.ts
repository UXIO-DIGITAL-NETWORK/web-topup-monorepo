import { useQuery } from "@tanstack/react-query";

import { invoiceLogService } from "../services/invoiceLog.service";
import type { InvoiceLogListParams } from "../types/invoiceLog.type";

/** Paginated invoice-delivery trail; re-fetches whenever a filter or page changes. */
export const useInvoiceLogs = (params: InvoiceLogListParams) =>
  useQuery({
    queryKey: ["invoice-logs", "list", params],
    queryFn: () => invoiceLogService.list(params),
  });
