import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { orderTotalAfterDiscounts, pointsEarned } from "@/features/checkout/lib/points";
import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { PriceText } from "@/components/common/PriceText";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useAuthStore } from "@/store/useAuthStore";
import type { DiamondPackage } from "@/features/checkout/types/checkout.type";
import OrderConfirmModal from "./OrderConfirmModal";

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
   * True while the pre-payment price check is in flight — it runs when the buyer
   * presses "Top Up Now", so the button has to say what it is waiting for.
   */
  isCheckingPrice?: boolean;
  /**
   * The quote from before that check, when it came back different. Forwarded to
   * the confirmation modal so the change is visible where the buyer decides.
   */
  previousPrice?: number;
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
  isCheckingPrice = false,
  previousPrice,
  onRequestConfirm,
  isPreparing = false,
  onSubmit,
}: Props): React.JSX.Element {
  const { t, i18n } = useTranslation("checkout");
  const locale = i18n.language;
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  /**
   * "Top Up Now". The page's gate runs the pre-payment price check and validates
   * the account fields; the review modal opens only once both have passed, so the
   * number it shows is the number that will be charged.
   */
  const handleTopUp = async () => {
    if (!onRequestConfirm) {
      setConfirmOpen(true);
      return;
    }

    if (await onRequestConfirm()) setConfirmOpen(true);
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

      {/* CTA button */}
      <Box className="px-4 pb-4">
        <Button
          type="button"
          onClick={() => void handleTopUp()}
          // `isPreparing` is in here too: a second click would fire a second
          // supplier lookup, and for some games that one is billed.
          disabled={
            !selectedPackage ||
            !selectedPaymentName ||
            whatsapp.trim() === "" ||
            isPreparing ||
            isSubmitting ||
            isCheckingPrice
          }
          className="w-full py-3 text-[15px]"
        >
          {isCheckingPrice
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
        previousPrice={previousPrice}
        promoDiscount={promoDiscount}
        pointsDiscount={pointsDiscount}
        paymentName={selectedPaymentName}
        adminFee={adminFee}
        total={total}
        pointsEarned={earnedPoints}
        isGuest={isGuest}
      />
    </Box>
  );
}
