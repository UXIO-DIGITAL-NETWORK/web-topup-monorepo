import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { checkoutService } from "../services/checkout.service";
import {
  toCategoryTabs,
  toDiamondPackages,
  toGameInfo,
  toMemberCredits,
  toPaymentGroups,
  toReviews,
} from "../lib/mappers";

export const useGameQuery = (slug: string) =>
  useQuery({
    queryKey: ["checkout", "game", slug],
    queryFn: async () => {
      const response = await checkoutService.game(slug);
      return { detail: response.data, info: toGameInfo(response.data) };
    },
    enabled: Boolean(slug),
  });

export const useGameProductsQuery = (slug: string) => {
  // Prices are role-resolved server-side, so the cached list belongs to whoever
  // was signed in when it was fetched. Keying on the user forces a refetch on
  // login/logout instead of showing a member the guest price.
  const userId = useAuthStore((state) => state.user?.id ?? null);

  return useQuery({
    queryKey: ["checkout", "products", slug, userId],
    queryFn: async () => {
      const response = await checkoutService.products(slug);
      return {
        packages: toDiamondPackages(response.data),
        categories: toCategoryTabs(response.data),
      };
    },
    enabled: Boolean(slug),
  });
};

export const usePaymentChannelsQuery = () => {
  const userId = useAuthStore((state) => state.user?.id ?? null);

  return useQuery({
    // Same reason as above: the `balance` channel only exists for a member.
    queryKey: ["checkout", "payment-channels", userId],
    queryFn: async () => {
      const response = await checkoutService.paymentChannels();
      return {
        groups: toPaymentGroups(response.data.channels),
        memberCredits: toMemberCredits(response.data.channels),
      };
    },
  });
};

export const useGameReviewsQuery = (slug: string) =>
  useQuery({
    queryKey: ["checkout", "reviews", slug],
    queryFn: async () => {
      const response = await checkoutService.reviews(slug);
      return { summary: response.data.summary, reviews: toReviews(response.data) };
    },
    enabled: Boolean(slug),
  });

/**
 * Nickname lookup for the entered game id — triggered explicitly by the
 * "Cek Username" button, not on every keystroke: for some games the check runs
 * a paid supplier inquiry, so it must be user-initiated. Never blocks checkout —
 * a game with no provider, or a provider that is down, resolves to
 * `nickname: null` and the UI simply omits the line.
 */
export const useValidateGameIdMutation = (slug: string) =>
  useMutation({
    mutationFn: async (input: { target_uid: string; target_server?: string }) => {
      const response = await checkoutService.validateGameId(slug, input);
      return response.data;
    },
  });

export const useCheckoutMutation = () =>
  useMutation({
    mutationFn: checkoutService.checkout,
  });

/**
 * The pre-payment price/availability check. Deliberately a mutation rather than
 * a query: it is triggered by an event (the buyer picks a package), it writes on
 * the server, and the answer is only wanted for the package in hand — none of
 * which a cache of "the" answer would model.
 */
export const useRecheckItemMutation = () =>
  useMutation({
    mutationFn: async (productId: number) => {
      const response = await checkoutService.recheckItem(productId);
      return response.data;
    },
  });
