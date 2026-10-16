import { api } from "@/lib/axios";
import { API_VERSION } from "@/config/env";
import { toRowId, unwrapPaginated } from "@/lib/apiMappers";
import type { ApiResponse, PaginatedResponse } from "@/types/api.type";
import type { PriceChangeLog, PriceChangeLogListParams, PriceChangeSource, PriceChangeStatus } from "../types/product.type";

/**
 * The read-only audit trail of what the 5-minute price checker did — the
 * auto-reprices that landed, and the rows that need an admin (a SKU switched off
 * at the provider, a margin gone negative).
 *
 * Its own service because it is a distinct read surface: no mutations, one endpoint.
 */
const BASE = `${API_VERSION}/uxiolabs/price-change-logs`;

interface PriceChangeLogApiRow {
  id: number;
  supplier_product_id: number;
  product_id: number | null;
  buyer_sku_code: string;
  product_name: string;
  status: PriceChangeStatus;
  source: PriceChangeSource;
  needs_attention: boolean;
  reason: string | null;
  old_cost: number;
  new_cost: number;
  prices: PriceChangeLog["prices"];
  created_at: string;
}

const toPriceChangeLog = (row: PriceChangeLogApiRow): PriceChangeLog => ({
  ...row,
  id: toRowId(row.id),
});

export const priceChangeLogService = {
  list: async (params: PriceChangeLogListParams = {}): Promise<PaginatedResponse<PriceChangeLog>> => {
    const response: ApiResponse<PaginatedResponse<PriceChangeLogApiRow>> = await api.get(BASE, { params });
    return unwrapPaginated(response, toPriceChangeLog);
  },
};
