import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getApiErrorMessage } from "@/utils/apiError";
import {
  paymentChannelsService,
  settingsService,
  usersService,
  type PaymentChannelInput,
} from "../services/administration.service";
import type { AdministrationListParams, BalanceAdjustmentInput, UserStatus } from "../types/administration.type";

export const usePaymentChannelList = (params: AdministrationListParams) =>
  useQuery({ queryKey: ["payment-channels", "list", params], queryFn: () => paymentChannelsService.list(params) });

export const usePaymentChannel = (id?: string) =>
  useQuery({
    queryKey: ["payment-channels", "detail", id],
    queryFn: () => paymentChannelsService.getById(id as string),
    enabled: Boolean(id),
  });

export const useUpdatePaymentChannel = () => {
  const { t } = useTranslation("administration");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<PaymentChannelInput> }) =>
      paymentChannelsService.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-channels"] });
      toast.success(t("channelUpdated"));
    },
    onError: () => toast.error(t("channelUpdateFailed")),
  });
};

export const useDeletePaymentChannels = () => {
  const { t } = useTranslation("administration");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => paymentChannelsService.remove(id))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-channels"] });
      toast.success(t("channelDeleted"));
    },
    // The API refuses to delete a channel that has transactions, since that
    // would orphan historical orders — say so rather than a generic failure.
    onError: () => toast.error(t("channelDeleteBlocked")),
  });
};

export const useUserList = (params: AdministrationListParams) =>
  useQuery({ queryKey: ["users", "list", params], queryFn: () => usersService.list(params) });

/** The detail page's summary: profile, aggregates and membership in one call. */
export const useUserOverview = (id?: string) =>
  useQuery({
    queryKey: ["users", "overview", id],
    queryFn: () => usersService.overview(id as string),
    enabled: Boolean(id),
  });

export const useUserBalanceMutations = (id: string | undefined, params: AdministrationListParams) =>
  useQuery({
    queryKey: ["users", id, "balance-mutations", params],
    queryFn: () => usersService.balanceMutations(id as string, params),
    enabled: Boolean(id),
  });

export const useUserPointHistory = (id: string | undefined, params: AdministrationListParams) =>
  useQuery({
    queryKey: ["users", id, "point-history", params],
    queryFn: () => usersService.pointHistory(id as string, params),
    enabled: Boolean(id),
  });

export const useUserRefunds = (id: string | undefined, params: AdministrationListParams) =>
  useQuery({
    queryKey: ["users", id, "refunds", params],
    queryFn: () => usersService.refunds(id as string, params),
    enabled: Boolean(id),
  });

export const useAdjustBalance = () => {
  const { t } = useTranslation("administration");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BalanceAdjustmentInput }) => usersService.adjustBalance(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("balanceAdjusted"));
    },
    onError: () => toast.error(t("balanceAdjustFailed")),
  });
};

export const useSetUserStatus = () => {
  const { t } = useTranslation("administration");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) => usersService.setStatus(id, status),
    onSuccess: (_result, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(status === "active" ? "User reactivated" : `User ${status}`);
    },
    onError: () => toast.error(t("statusUpdateFailed")),
  });
};

export const useDeleteUsers = () => {
  const { t } = useTranslation("administration");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => usersService.remove(id))),
    onSuccess: (_result, ids) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(ids.length === 1 ? "User deleted" : `${ids.length} users deleted`);
    },
    onError: () => toast.error(t("deleteUsersFailed")),
  });
};

export const useSettings = (group?: string) =>
  useQuery({ queryKey: ["settings", group], queryFn: () => settingsService.list(group) });

export const useUpdateSettings = () => {
  const { t } = useTranslation("administration");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: Record<string, string | number | boolean>) => settingsService.update(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(t("settingsSaved"));
    },
    onError: () => toast.error(t("settingsSaveFailed")),
  });
};

/**
 * Image settings are written one file at a time, not through the bulk save —
 * see `settingsService.upload`.
 */
export const useUploadSetting = () => {
  const { t } = useTranslation("administration");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, file }: { key: string; file: File }) => settingsService.upload(key, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(t("imageUploaded"));
    },
    onError: (error) => {
      // A refusal the API never produced — nginx rejecting an oversized upload,
      // a proxy giving up — carries no JSON message, so the status code is the
      // only thing that says which layer refused the file. Without it, "Gagal
      // mengunggah gambar" reads the same for a wrong mime list and for a
      // server-side size limit, which is exactly how this stayed undiagnosed.
      const status = (error as { response?: { status?: number } })?.response?.status;
      const fallback = status ? `${t("imageUploadFailed")} (HTTP ${status})` : t("imageUploadFailed");

      toast.error(getApiErrorMessage(error, fallback));
    },
  });
};
