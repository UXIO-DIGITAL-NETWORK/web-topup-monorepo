import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useRecheckItemMutation } from "@/features/checkout/hooks/useCheckoutQueries";
import type { RecheckResult } from "@/features/checkout/types/checkout.type";

interface Options {
  /** Game slug — the products query whose prices must follow a reprice. */
  slug: string;
}

/**
 * The price/availability question, asked on demand: the moment the buyer presses
 * "Top Up Now", not while they browse.
 *
 * Asking once, for the package they actually chose, is what makes this cheap —
 * a buyer clicking through ten packages costs one supplier call instead of ten,
 * and nothing is spent on a package they were only comparing.
 */
export function useCheckoutRecheck({ slug }: Options) {
  const { mutateAsync } = useRecheckItemMutation();
  const queryClient = useQueryClient();

  const [isChecking, setIsChecking] = useState(false);
  const [state, setState] = useState<{ productId: number; result: RecheckResult | null } | null>(
    null,
  );

  /**
   * Returns the answer, or null when the request itself failed. The caller treats
   * both the same way: neither is a price to sell on.
   */
  const check = useCallback(
    async (productId: number): Promise<RecheckResult | null> => {
      setIsChecking(true);

      try {
        const answer = await mutateAsync(productId);
        setState({ productId, result: answer });

        // A reprice happened server-side, so the cached list now holds the old
        // price. Awaited on purpose: the summary is about to be shown, and it has
        // to carry the price that will be billed rather than the one it replaced.
        if (answer.outcome === "price_changed") {
          await queryClient.invalidateQueries({ queryKey: ["checkout", "products", slug] });
        }

        return answer;
      } catch {
        // The endpoint answers 200 with an outcome for every business answer, so
        // reaching here is the request itself failing.
        setState({ productId, result: null });
        return null;
      } finally {
        setIsChecking(false);
      }
    },
    [mutateAsync, queryClient, slug],
  );

  // The result is stored WITH the package it belongs to: a stale answer must never
  // be rendered against the price of a package the buyer has since switched to.
  const belongsToSelected = state?.productId ?? null;

  return { check, isChecking, result: state?.result ?? null, resultProductId: belongsToSelected };
}
