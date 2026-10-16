import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { orderTotalAfterDiscounts, pointsEarned } from "@/features/checkout/lib/points";
import { recheckBlocksCheckout, type RecheckDecision, type RecheckStatus } from "@/features/checkout/lib/recheck";
import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { PriceText } from "@/components/common/PriceText";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useAuthStore } from "@/store/useAuthStore";
import type { DiamondPackage, RecheckResult } from "@/features/checkout/types/checkout.type";
import OrderConfirmModal from "./OrderConfirmModal";
import PriceChangedModal from "./PriceChangedModal";

interface Props {
  selectedPackage: DiamondPackage | null;
  /** Package price ("Harga"). */
  totalPrice: number;
  /** Rupiah taken off by the promo code; 0 when none is applied. */
  promoDiscount?: number;
  /** "Biaya Admin" — the selected payment method's fee. */
  adminFee: number;
  /** Rupiah covered by redeemed loyalty points; 0 when none are applied. */
  pointsDiscount?: number;
  gameThumbnail: string;
  gameName: string;
  selectedPaymentName?: string;
  userId: string;
  serverId: string;
  whatsapp: string;
  /** Validated in-game nickname, or null when the game has no lookup provider. */
  nickname?: string | null;
  isSubmitting?: boolean;
  /**
   * State of the pre-payment price check for the selected package. The button
   * stands on this: while it is out the button says so, and an item the provider
   * switched off (or one we could not check) keeps it shut.
   */
  recheckStatus: RecheckStatus;
  /** What the check found, when it has an answer — the price dialog reads it. */
  recheckResult: RecheckResult | null;
  /** The check's verdict; `confirm` opens the price dialog instead of the review. */
  recheckDecision: RecheckDecision | null;
  /** Re-asks the question after an inconclusive answer. */
  onRetryRecheck: () => void;
  /**
   * Last gate before the confirmation modal: validates the account fields and,
   * for a game with a lookup provider, makes sure the id has actually been
   * checked. Resolving false keeps the modal shut — the page has already told
   * the buyer why.
   */
  onRequestConfirm?: () => Promise<boolean>;
  /** True while that gate is running (a supplier lookup takes a moment). */
  isPreparing?: boolean;
  onSubmit: () => void;
}

/** One label/value row in the price breakdown. */
function FeeRow({ label, value }: { label: string; value: string }) {
  return (
    <Box className="flex items-center justify-between gap-4">
      <Text as="span" className="font-inter text-[13px] text-white/55 leading-none">
        {label}
      </Text>
      <Text as="span" className="font-plex text-[13px] text-white font-medium leading-none">
        {value}
      </Text>
    </Box>
  );
}

export default function OrderSummary({
  selectedPackage,
  totalPrice,
  promoDiscount = 0,
  adminFee,
  pointsDiscount = 0,
  gameThumbnail,
  gameName,
  selectedPaymentName,
  userId,
  serverId,
  whatsapp,
  nickname,
  isSubmitting = false,
  recheckStatus,
  recheckResult,
  recheckDecision,
  onRetryRecheck,
  onRequestConfirm,
  isPreparing = false,
  onSubmit,
}: Props): React.JSX.Element {
  const { t, i18n } = useTranslation("checkout");
  const locale = i18n.language;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [priceChangedOpen, setPriceChangedOpen] = useState(false);

  // The same order the server applies them in: the promo comes off the package
  // price, points come off what is left, and a fully covered order owes nothing
  // at all — there is no payment left for a fee to sit on. Mirrors what the API
  // recomputes, so the number shown is the number charged.
  const priceAfterPromo = Math.max(0, totalPrice - promoDiscount);
  const remaining = Math.max(0, priceAfterPromo - pointsDiscount);
  const total = orderTotalAfterDiscounts(totalPrice, promoDiscount, pointsDiscount, adminFee);

  // Points are only ever granted to an account, so a guest sees the number as
  // an invitation rather than a promise.
  const isGuest = useAuthStore((state) => state.user) === null;
  const earnedPoints = pointsEarned(
    priceAfterPromo,
    pointsDiscount,
    selectedPackage?.pointPercent ?? 0,
    selectedPackage?.pointFlat ?? 0,
  );

  /** The account-field/nickname gate, then the review modal. */
  const openConfirm = async () => {
    if (!onRequestConfirm) {
      setConfirmOpen(true);
      return;
    }

    if (await onRequestConfirm()) setConfirmOpen(true);
  };

  const handleTopUp = async () => {
    // The button is disabled in these states; this is the second lock, so a
    // keyboard path or a stale render cannot place an order the check refused.
    if (recheckBlocksCheckout(recheckStatus)) return;

    // An upward move is a question about money, so it is asked before the review
    // rather than inside it — the buyer sees what changed and still chooses.
    if (recheckDecision === "confirm") {
      setPriceChangedOpen(true);
      return;
    }

    await openConfirm();
  };

  return (
    <Box className="rounded-2xl border border-dotted border-[rgba(147,51,234,0.5)] bg-[#0D1117] overflow-hidden">
      {/* Package info row */}
      <Box className="px-4 py-4 flex items-center gap-3">
        {/* Portrait game thumbnail */}
        <Box className="w-[60px] h-[75px] rounded-xl overflow-hidden shrink-0 border border-violet-75/30 shadow-glow-violet">
          <img src={gameThumbnail} alt={gameName} className="w-full h-full object-cover" />
        </Box>

        {/* Package details */}
        <Box className="flex-1 min-w-0 flex flex-col gap-1">
          {selectedPackage ? (
            <Text as="span" className="font-dmsans font-bold text-[14px] text-white leading-tight block">
              {selectedPackage.name}
            </Text>
          ) : (
            <Text as="span" className="font-inter text-[13px] text-white/30 italic leading-tight block">
              {t("summary.noPackageSelected")}
            </Text>
          )}
          {selectedPaymentName && (
            <Text as="span" className="font-inter text-[13px] text-white/60 leading-none block">
              1x - {selectedPaymentName}
            </Text>
          )}
          <Text as="span" className="font-inter text-[11px] text-white/35 italic leading-none block">
            **{t("summary.instantProcess")}
          </Text>
        </Box>
      </Box>

      {/* Divider */}
      <Box className="h-px bg-white/8 mx-0" />

      {/* Price breakdown */}
      <Box className="px-4 pt-4 pb-2 flex flex-col gap-2.5">
        <FeeRow label={t("summary.price")} value={formatCurrency(totalPrice, locale)} />
        {promoDiscount > 0 && (
          <FeeRow
            label={t("summary.promoDiscount")}
            value={`- ${formatCurrency(promoDiscount, locale)}`}
          />
        )}
        {pointsDiscount > 0 && (
          <FeeRow
            label={t("summary.pointsDiscount")}
            value={`- ${formatCurrency(pointsDiscount, locale)}`}
          />
        )}
        {adminFee > 0 && remaining > 0 && (
          <FeeRow label={t("summary.adminFee")} value={formatCurrency(adminFee, locale)} />
        )}
      </Box>

      {/* Divider */}
      <Box className="h-px bg-white/8 mx-0" />

      {/* Total */}
      <Box className="px-4 py-3 flex items-center justify-between">
        <Text as="span" className="font-outfit font-bold text-[14px] text-white">
          {t("summary.totalPayment")}
        </Text>
        <PriceText className="text-[20px] leading-tight">{formatCurrency(total, locale)}</PriceText>
      </Box>

      {/* Points this order earns — the same base the API grants on. */}
      {earnedPoints > 0 && (
        <Box className="mx-4 mb-3 rounded-xl border border-[rgba(147,51,234,0.35)] bg-[rgba(147,51,234,0.12)] px-3 py-2 flex items-center justify-between gap-3">
          <Text as="span" className="font-inter text-[12px] text-violet-lavender/80 leading-snug">
            {isGuest ? t("summary.pointsEarnedGuest", { points: formatNumber(earnedPoints, locale) }) : t("summary.pointsEarned")}
          </Text>
          {!isGuest && (
            <Text as="span" className="font-plex font-bold text-[14px] text-violet-lavender leading-none whitespace-nowrap">
              +{formatNumber(earnedPoints, locale)}
            </Text>
          )}
        </Box>
      )}

      {/* The check's verdict, when it is "not this one" — the button alone cannot
          say why it is shut. */}
      {(recheckStatus === "unavailable" || recheckStatus === "unknown") && (
        <Box className="mx-4 mb-3 rounded-xl border border-[rgba(147,51,234,0.35)] bg-[rgba(147,51,234,0.12)] px-3 py-2.5 flex flex-col items-start gap-2">
          <Text as="span" className="font-inter text-[12px] text-violet-lavender/80 leading-snug">
            {recheckStatus === "unavailable"
              ? t("summary.unavailableMessage")
              : t("summary.unknownMessage")}
          </Text>
          <button
            type="button"
            onClick={onRetryRecheck}
            className="font-outfit font-semibold text-[12px] text-violet-lavender underline underline-offset-2 cursor-pointer hover:text-white transition-colors"
          >
            {t("summary.retryCheck")}
          </button>
        </Box>
      )}

      {/* CTA button */}
      <Box className="px-4 pb-4">
        <Button
          type="button"
          onClick={() => void handleTopUp()}
          // `isPreparing` is in here too: a second click would fire a second
          // supplier lookup, and for some games that one is billed. The check's
          // blocking states are in here for the same reason: nothing may be
          // ordered while the price is unknown or the item is off sale.
          disabled={
            !selectedPackage ||
            !selectedPaymentName ||
            whatsapp.trim() === "" ||
            isPreparing ||
            isSubmitting ||
            recheckBlocksCheckout(recheckStatus)
          }
          className="w-full py-3 text-[15px]"
        >
          {recheckStatus === "checking"
            ? t("summary.checkingPrice")
            : isPreparing
              ? t("summary.checkingId")
              : isSubmitting
                ? t("summary.processing")
                : t("summary.buyNow")}
        </Button>
      </Box>

      {/* Confirmation modal */}
      <OrderConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          onSubmit();
          setConfirmOpen(false);
        }}
        userId={userId}
        serverId={serverId}
        username={nickname ?? undefined}
        itemLabel={
          selectedPackage
            ? selectedPackage.amount > 0
              ? `${selectedPackage.amount} ${t("packages.unit")}`
              : selectedPackage.name
            : ""
        }
        productName={gameName}
        price={selectedPackage?.price ?? 0}
        promoDiscount={promoDiscount}
        pointsDiscount={pointsDiscount}
        paymentName={selectedPaymentName}
        adminFee={adminFee}
        total={total}
        pointsEarned={earnedPoints}
        isGuest={isGuest}
      />

      {/* The price moved up: say so before the review, and only continue if the
          buyer accepts the new number. */}
      <PriceChangedModal
        isOpen={priceChangedOpen}
        onClose={() => setPriceChangedOpen(false)}
        onConfirm={() => {
          setPriceChangedOpen(false);
          void openConfirm();
        }}
        productName={selectedPackage?.name ?? gameName}
        previousPrice={recheckResult?.previous_price ?? 0}
        newPrice={recheckResult?.price ?? 0}
      />
    </Box>
  );
}
