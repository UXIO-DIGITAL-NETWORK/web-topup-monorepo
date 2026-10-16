import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useRecheckItemMutation } from "@/features/checkout/hooks/useCheckoutQueries";
import {
  decideRecheck,
  recheckStatusFrom,
  type RecheckDecision,
  type RecheckStatus,
} from "@/features/checkout/lib/recheck";
import type { RecheckResult } from "@/features/checkout/types/checkout.type";

interface Options {
  /** Id of the selected package; null while the buyer has picked nothing. */
  productId: number | null;
  /** Game slug — the products query whose prices must follow a reprice. */
  slug: string;
}

interface State {
  productId: number;
  status: RecheckStatus;
  result: RecheckResult | null;
}

/**
 * Owns the pre-payment check for whichever package is selected.
 *
 * It runs the moment a package is chosen, and its answer is what the "Top Up
 * Now" button stands on: while the question is out the button says so, an item
 * the provider has switched off keeps it shut, and a price that went up is
 * confirmed by a human before the order is placed.
 *
 * Answers are stored WITH the package they belong to, so picking another package
 * invalidates the previous one in the same render — there is never a frame where
 * one package's verdict is shown against another's price.
 */
export function useCheckoutRecheck({ productId, slug }: Options) {
  const { mutateAsync } = useRecheckItemMutation();
  const queryClient = useQueryClient();

  const [state, setState] = useState<State | null>(null);

  // The package the buyer is on right now. An answer that arrives after they have
  // moved on is dropped rather than rendered against the wrong item.
  const latest = useRef<number | null>(productId);
  useEffect(() => {
    latest.current = productId;
  }, [productId]);

  const run = useCallback(
    async (id: number) => {
      setState({ productId: id, status: "checking", result: null });

      try {
        const result = await mutateAsync(id);
        if (latest.current !== id) return;

        setState({ productId: id, status: recheckStatusFrom(result.outcome), result });

        // A reprice happened server-side, so the cached list is now the old truth.
        // Refetching is what makes the summary show the price that will be billed
        // rather than the one that was quoted a moment ago.
        if (result.outcome === "price_changed") {
          void queryClient.invalidateQueries({ queryKey: ["checkout", "products", slug] });
        }
      } catch {
        if (latest.current !== id) return;

        // The endpoint answers 200 with an outcome for every business answer, so
        // reaching here means the request itself failed. We genuinely do not know
        // — which is the honest thing to show, not a guess.
        setState({ productId: id, status: "unknown", result: null });
      }
    },
    [mutateAsync, queryClient, slug],
  );

  useEffect(() => {
    if (productId === null) return;
    void run(productId);
    // Only the selection re-asks. `run`'s identity changing is not a new question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const active = state !== null && state.productId === productId ? state : null;

  // A freshly picked package has no answer yet, and no answer means "still asking".
  const status: RecheckStatus = productId === null ? "idle" : (active?.status ?? "checking");

  const decision: RecheckDecision | null = active?.result
    ? decideRecheck(active.result.outcome, active.result.previous_price, active.result.price)
    : null;

  const retry = useCallback(() => {
    if (productId !== null) void run(productId);
  }, [productId, run]);

  return { status, result: active?.result ?? null, decision, retry };
}
