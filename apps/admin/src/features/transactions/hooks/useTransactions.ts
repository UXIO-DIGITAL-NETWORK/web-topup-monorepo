import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { transactionsService } from "../services/transactions.service";
import { downloadBlob } from "../lib/downloadBlob";
import { useEchoConnected } from "@/hooks/useEchoConnected";
import type { RecapPeriod, TransactionListParams } from "../types/transaction.type";

export const useTransactionList = (params: TransactionListParams) => {
  // Realtime (useTransactionsRealtime) is the primary refresh path. Poll only as
  // a safety net: a very slow self-heal while the socket is healthy, faster when
  // it has dropped. Avoids a constant background refetch on every admin tab.
  const connected = useEchoConnected();

  return useQuery({
    queryKey: ["transactions", "list", params],
    queryFn: () => transactionsService.list(params),
    refetchInterval: connected ? 120_000 : 30_000,
  });
};

export const useTransaction = (id: string) =>
  useQuery({
    queryKey: ["transactions", "detail", id],
    queryFn: () => transactionsService.getById(id),
  });

/**
 * Backs the read-only Transaction Detail dialog.
 *
 * `enabled` is the dialog's open state, and is load-bearing for the same
 * reason as the Activity Log dialog's: the dialog is mounted once per table
 * row, so without it every visible row would fetch its detail on mount.
 *
 * The key segment is `detail-full`, not `detail`: it is the same id but a
 * wider shape, and the two must not collide in the cache.
 */
export const useTransactionDetail = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ["transactions", "detail-full", id],
    queryFn: () => transactionsService.getDetail(id),
    enabled,
  });

/**
 * `enabled` is the dialog's open state, and is load-bearing: the Activity Log
 * dialog is mounted once per table row, so without it every visible row would
 * fetch its log on mount.
 */
export const useTransactionActivityLog = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ["transactions", "activity-log", id],
    queryFn: () => transactionsService.getActivityLog(id),
    enabled,
  });

export const useStatusCounts = () =>
  useQuery({
    queryKey: ["transactions", "status-counts"],
    queryFn: transactionsService.getStatusCounts,
  });

export const useEditTransaction = () => {
  const { t } = useTranslation("transactions");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) => transactionsService.edit(id, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(t("updated"));
    },
    onError: () => {
      toast.error(t("updateFailed"));
    },
  });
};

export const useDeleteTransaction = () => {
  const { t } = useTranslation("transactions");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => transactionsService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(t("deleted"));
    },
    onError: () => {
      toast.error(t("deleteFailed"));
    },
  });
};

export const useRefund = () => {
  const { t } = useTranslation("transactions");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => transactionsService.refund(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      // The refunds queue now owns a row for every refund, member or guest.
      queryClient.invalidateQueries({ queryKey: ["refunds"] });
      // Deliberately not "Refund initiated": nothing is left in flight. A
      // member's balance is credited immediately; a guest's refund is queued
      // on the Refunds page for a manual transfer.
      toast.success(t("refundOpened"));
    },
    onError: () => {
      // The API 422s when there is nothing to refund (never paid, already
      // refunded), which the old flow reported as a success.
      toast.error(t("refundFailed"));
    },
  });
};

export const useResendCallback = () => {
  const { t } = useTranslation("transactions");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => transactionsService.resendCallback(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(t("callbackResent"));
    },
    onError: () => {
      toast.error(t("callbackResendFailed"));
    },
  });
};

/** Rehit one sub-order of a mix — the per-row action on the detail screen. */
export const useResendSupplierOrderCallback = () => {
  const { t } = useTranslation("transactions");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, orderId }: { id: string; orderId: string }) =>
      transactionsService.resendSupplierOrder(id, orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(t("callbackResent"));
    },
    onError: () => {
      toast.error(t("callbackResendFailed"));
    },
  });
};

export const useRetryInvoice = () => {
  const { t } = useTranslation("transactions");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => transactionsService.retryInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(t("invoiceRetried"));
    },
    onError: () => {
      toast.error(t("invoiceRetryFailed"));
    },
  });
};

export const useResendReceipt = () => {
  const { t } = useTranslation("transactions");

  return useMutation({
    mutationFn: (id: string) => transactionsService.resendReceipt(id),
    onSuccess: () => {
      toast.success(t("receiptResent"));
    },
    onError: () => {
      toast.error(t("receiptResendFailed"));
    },
  });
};

/**
 * `enabled` is the Recap dialog's open state — the query only runs while the
 * dialog is mounted-and-open, and re-runs when the operator flips the period.
 */
export const useRecap = (period: RecapPeriod, enabled: boolean) =>
  useQuery({
    queryKey: ["transactions", "recap", period],
    queryFn: () => transactionsService.getRecap(period),
    enabled,
  });

export const useExportTransactions = () => {
  const { t } = useTranslation("transactions");

  return useMutation({
    mutationFn: (params: TransactionListParams) => transactionsService.exportTransactions(params),
    onSuccess: (blob) => {
      downloadBlob(blob, "transactions.csv");
      toast.success(t("exportReady"));
    },
    onError: () => {
      toast.error(t("exportFailed"));
    },
  });
};
