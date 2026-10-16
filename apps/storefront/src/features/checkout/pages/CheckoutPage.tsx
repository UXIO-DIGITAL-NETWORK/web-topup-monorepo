import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Box } from "@/components/common/Box";
import { Navbar } from "@/components/shared/Navbar";
import { Footer } from "@/components/shared/Footer";
import {
  ProductBanner,
  GameInfoBar,
  AccountDetailForm,
  DiamondPackages,
  PaymentMethods,
  ContactDetail,
  PromoCode,
  CustomerReviews,
  OrderSummary,
} from "@/features/checkout/components";
import { useCheckoutSelection } from "@/features/checkout/hooks/useCheckoutSelection";
import {
  useCheckoutMutation,
  useGameProductsQuery,
  useGameQuery,
  useGameReviewsQuery,
  usePaymentChannelsQuery,
} from "@/features/checkout/hooks/useCheckoutQueries";
import { useNicknameCheck } from "@/features/checkout/hooks/useNicknameCheck";
import { useCheckoutRecheck } from "@/features/checkout/hooks/useCheckoutRecheck";
import { calculateAdminFee } from "@/features/checkout/lib/mappers";
import { recheckBlocksCheckout, recheckPriceChange } from "@/features/checkout/lib/recheck";
import { getOrderFormErrors } from "@/features/checkout/lib/orderFormValidation";
import { normalizeWhatsappNumber } from "@/lib/phone";
import { useCheckoutStore } from "@/store/useCheckoutStore";
import { useAuthStore } from "@/store/useAuthStore";
import { usePointsBalance } from "@/features/checkout/hooks/usePointsBalance";
import { applyPoints, maxRedeemablePoints, pointsEarned } from "@/features/checkout/lib/points";
import PointsRedeem from "@/features/checkout/components/points/PointsRedeem";
import type { GameInfo, PaymentOption } from "@/features/checkout/types/checkout.type";

/** Shown while the game loads, so the header doesn't collapse mid-render. */
const EMPTY_GAME: GameInfo = { name: "", publisher: "", region: "", slug: "", logo: "", thumbnail: "" };

export default function CheckoutPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation("checkout");
  const { locale, gameSlug } = useParams({ strict: false }) as { locale: string; gameSlug: string };
  const setPendingOrder = useCheckoutStore((s) => s.setPendingOrder);

  const gameQuery = useGameQuery(gameSlug);
  const productsQuery = useGameProductsQuery(gameSlug);
  const channelsQuery = usePaymentChannelsQuery();
  const reviewsQuery = useGameReviewsQuery(gameSlug);
  const checkoutMutation = useCheckoutMutation();

  const game = gameQuery.data?.info ?? EMPTY_GAME;
  // Memoised because the `?? []` fallback would otherwise hand `getOrderFormErrors`
  // a fresh array on every render.
  const orderFormFields = useMemo(
    () => gameQuery.data?.detail.order_form_fields ?? [],
    [gameQuery.data],
  );
  const packages = useMemo(() => productsQuery.data?.packages ?? [], [productsQuery.data]);
  const categories = useMemo(() => productsQuery.data?.categories ?? [], [productsQuery.data]);
  const paymentGroups = useMemo(() => channelsQuery.data?.groups ?? [], [channelsQuery.data]);
  const memberCredits = channelsQuery.data?.memberCredits ?? null;

  const {
    selectedPackageId,
    selectedPaymentId,
    activeCategory,
    fieldValues,
    whatsapp,
    email,
    filteredPackages,
    visibleCategories,
    selectedPackage,
    totalPrice,
    setActiveCategory,
    setFieldValue,
    setWhatsapp,
    setEmail,
    handleSelectPackage,
    handleSelectPayment,
  } = useCheckoutSelection({ packages, categories });

  // The game decides how many identifiers it wants; the first two are the ones
  // the mirrored columns and the nickname lookup know about. Derived from the
  // declared field list rather than held separately, so they cannot fall out of
  // step with the order the API declared them in.
  const userId = fieldValues[orderFormFields[0]?.key ?? ""] ?? "";
  const serverId = fieldValues[orderFormFields[1]?.key ?? ""] ?? "";

  // Prefill the email for a logged-in member from their account (still editable).
  const authEmail = useAuthStore((s) => s.user?.email);
  useEffect(() => {
    if (authEmail) setEmail(authEmail);
    // Only when the signed-in member changes; the field stays editable after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authEmail]);

  // "Cek Username" is button-triggered (a paid supplier check for some games),
  // so the resolved name is held locally and cleared whenever the id changes.
  const supportsNicknameCheck = gameQuery.data?.detail.supports_nickname_check ?? false;
  const {
    nickname,
    checked: nicknameChecked,
    isChecking,
    checkNow,
    ensureChecked,
  } = useNicknameCheck({
    slug: gameSlug,
    supported: supportsNicknameCheck,
    userId,
    serverId,
  });

  // The price/availability question, asked on demand: it runs inside the
  // confirmation gate, for the package the buyer actually chose.
  const {
    check: recheckItem,
    isChecking: isCheckingPrice,
    result: recheckResult,
    resultProductId: recheckProductId,
  } = useCheckoutRecheck({ slug: gameSlug });

  // Forwarded to the review modal only when the answer belongs to the package on
  // screen and the quote really moved; a stale answer from a package the buyer has
  // since switched away from must not be shown against this one's price.
  const previousPrice =
    recheckResult !== null &&
    recheckProductId === selectedPackage?.productId &&
    recheckPriceChange(recheckResult) !== "none"
      ? recheckResult.previous_price
      : undefined;

  // The account fields are validated against the rules the game declared. For a
  // game with no lookup provider this is the only thing standing between a
  // typo'd id and a paid order the supplier will reject.
  const fieldErrors = useMemo(
    () => getOrderFormErrors(orderFormFields, fieldValues),
    [orderFormFields, fieldValues],
  );
  const [showFieldErrors, setShowFieldErrors] = useState(false);

  /** The wallet, or the chip the customer picked out of a group. */
  const selectedPayment = useMemo((): PaymentOption | null => {
    if (!selectedPaymentId) return null;

    if (memberCredits && selectedPaymentId === memberCredits.id) {
      return {
        id: memberCredits.id,
        channelId: memberCredits.channelId,
        name: t("payment.credits"),
        logo: memberCredits.logo,
        minAmount: 0,
        feeFlat: 0,
        feePercent: 0,
      };
    }

    for (const group of paymentGroups) {
      const found = group.options.find((option) => option.id === selectedPaymentId);
      if (found) return found;
    }

    return null;
  }, [selectedPaymentId, memberCredits, paymentGroups, t]);

  // Held here rather than inside PromoCode so the code reaches checkout and
  // the summary can show what it is worth. The server re-resolves it, so this
  // figure is display-only.
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountAmount: number } | null>(null);
  const promoDiscount = appliedPromo?.discountAmount ?? 0;

  // Everything below mirrors `CheckoutAction`'s order of operations exactly —
  // promo, then points, then the channel fee on what is left — because a
  // summary that disagrees with the invoice is the one thing this screen must
  // not do. See the numbered blocks in that action.
  const priceAfterPromo = Math.max(0, totalPrice - promoDiscount);

  // Loyalty points. The API re-derives every figure at checkout — this is so
  // the buyer sees the same total before they commit.
  const { data: pointsSummary } = usePointsBalance();
  const [usePoints, setUsePoints] = useState(false);
  const pointsRate = pointsSummary?.redeem_rate ?? 1;
  // Derived, never stored: ticking the box means "spend what this order can
  // absorb", and the answer changes the moment the buyer picks another package.
  // Holding a number here would leave a stale one behind. Capped on the price
  // the promo already reduced, as `PointRules::pointsToCover` caps it server-side.
  const pointsToSpend =
    usePoints && pointsSummary ? maxRedeemablePoints(priceAfterPromo, pointsSummary.points, pointsRate) : 0;
  const pointsApplied = pointsSummary
    ? applyPoints(priceAfterPromo, pointsSummary.points, pointsRate, pointsToSpend)
    : { points: 0, discount: 0, coversEverything: false };

  /** What is left to pay for the item itself, before the channel's fee. */
  const payablePrice = Math.max(0, priceAfterPromo - pointsApplied.discount);

  // Mirrors CheckoutAction's fee maths so the summary/modal show the exact
  // total the customer is about to be charged: the discounted price plus the
  // method's fee. Charged on what the customer actually pays, so a fully
  // covered order carries no fee at all — the same rule the server applies.
  const adminFee =
    selectedPayment && payablePrice > 0 ? calculateAdminFee(selectedPayment, payablePrice) : 0;

  /**
   * The one live price/availability check, asked for the package actually chosen.
   * `unavailable` and "no answer" both keep the buyer on the page with the reason
   * — only a price we can stand behind opens the review.
   */
  const confirmPrice = async (): Promise<boolean> => {
    if (!selectedPackage) return false;

    const answer = await recheckItem(selectedPackage.productId);

    if (recheckBlocksCheckout(answer?.outcome ?? null)) {
      toast.error(
        answer?.outcome === "unavailable"
          ? t("summary.unavailableMessage")
          : t("summary.unknownMessage"),
      );
      return false;
    }

    return true;
  };

  /**
   * Runs when the buyer presses "Top Up Sekarang", before the confirmation
   * modal is allowed to open. Returning false keeps it shut.
   *
   * Order matters: the declared field rules and the account-id lookup come first
   * because they are cheap (or, for the lookup, already paid for), and the
   * package's live price check comes last — so the modal shows, and the order is
   * placed against, the price the provider is quoting right now.
   */
  const handleRequestConfirm = async (): Promise<boolean> => {
    if (Object.values(fieldErrors).some(Boolean)) {
      setShowFieldErrors(true);
      toast.error(t("accountDetail.errors.fixFields"));
      return false;
    }

    if (supportsNicknameCheck && !(await ensureChecked())) {
      toast.error(t("accountDetail.nicknameError"));
      return false;
    }

    return await confirmPrice();
  };

  const handleConfirmCheckout = () => {
    if (!selectedPackage || !selectedPayment) return;

    checkoutMutation.mutate(
      {
        product_id: selectedPackage.productId,
        payment_channel_id: selectedPayment.channelId,
        // The full keyed set — how many identifiers a game needs is a data
        // decision, not a layout one.
        order_fields: fieldValues,
        // The first two, mirrored for the API's named columns and kept so an API
        // that has not been redeployed yet still reads the pair it knows.
        target_uid: userId.trim(),
        target_server: serverId.trim() || undefined,
        // Display-only echo of what validate-id returned; the API stores it so
        // the receipt keeps showing the name that was confirmed here.
        target_nickname: nickname ?? undefined,
        guest_contact: normalizeWhatsappNumber(whatsapp) || undefined,
        // Required destination for the purchase-receipt email (and a tracking key).
        email: email.trim(),
        // Storefront language, so the receipt email is sent in the buyer's language.
        locale,
        promo_code: appliedPromo?.code,
        points_to_spend: pointsApplied.points || undefined,
      },
      {
        onSuccess: (response) => {
          const result = response.data;

          // Seeds the invoice page's first paint. The server stays the source
          // of truth — the invoice query overwrites this once it resolves.
          setPendingOrder({
            invoiceNumber: result.invoice_number,
            gameName: game.name,
            gameRegion: game.region,
            gameThumbnail: game.thumbnail,
            packageLabel: selectedPackage.name,
            userId: userId.trim(),
            serverId: serverId.trim(),
            username: nickname ?? "",
            paymentName: result.payment.channel,
            price: result.product.price,
            adminFee: result.payment.admin_fee,
            total: result.payment.amount,
            // Seeded so the invoice's points row does not flicker in from zero
            // before the invoice query resolves. It is still an estimate, and
            // the server's answer overwrites it a moment later. Earned on the
            // price net of the promo, as the server bases it on `amount_base`.
            pointsEarned: pointsEarned(
              priceAfterPromo,
              pointsApplied.discount,
              selectedPackage.pointPercent,
              selectedPackage.pointFlat,
            ),
            pointsAreEstimate: true,
            // Points are credited to an account; a guest order earns none.
            pointsEligible: authEmail !== undefined && authEmail !== null,
            createdAt: Date.now(),
          });

          navigate({
            to: "/$locale/invoice/$invoiceNumber",
            params: { locale: locale ?? "id", invoiceNumber: result.invoice_number },
          });
        },
        onError: (error: unknown) => {
          // The API returns a human-readable reason for every business-rule
          // rejection (insufficient balance, product unavailable, duplicate
          // submit) — surface that instead of a generic failure.
          const message =
            (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            t("errors:generic", { defaultValue: "Terjadi kesalahan. Silakan coba lagi." });
          toast.error(message);
        },
      },
    );
  };

  return (
    <Box className="min-h-dvh bg-[#0A0A0C]">
      <Navbar />

      {/* Header banner unit — full-width background, content stays at max-w-6xl */}
      <Box className="w-full">
        <ProductBanner />
        <GameInfoBar game={game} />
      </Box>

      {/* Two-column layout */}
      <Box className="max-w-6xl mx-auto px-4 md:px-8 mt-14 pb-14">
        <Box className="grid grid-cols-1 lg:grid-cols-[5fr_8fr] gap-5 items-start">

          {/* ── Left column ──
               On desktop: normal flex-col so AccountDetailForm + Reviews stack tightly.
               On mobile: `contents` makes this box transparent — children become direct
               grid items so CSS `order` can place Reviews after the right column. ── */}
          <Box className="contents lg:flex lg:flex-col lg:gap-5">
            <AccountDetailForm
              fields={orderFormFields}
              values={fieldValues}
              onValueChange={setFieldValue}
              errors={fieldErrors}
              showErrors={showFieldErrors}
              nickname={nickname}
              isValidatingNickname={isChecking}
              supportsNicknameCheck={supportsNicknameCheck}
              onCheckUsername={checkNow}
              nicknameChecked={nicknameChecked}
            />
            {/* Reviews: order-last on mobile (after right col), natural position on desktop */}
            <Box className="order-last lg:order-0">
              <CustomerReviews
                reviews={reviewsQuery.data?.reviews}
                summary={reviewsQuery.data?.summary}
              />
            </Box>
          </Box>

          {/* ── Right column (mobile: order-2 so it sits between AccountDetail and Reviews) ── */}
          <Box className="flex flex-col gap-5 order-2 lg:order-0">
            <DiamondPackages
              packages={filteredPackages}
              categories={visibleCategories}
              selectedPackageId={selectedPackageId}
              activeCategory={activeCategory}
              onSelectPackage={handleSelectPackage}
              onCategoryChange={setActiveCategory}
            />

            <PaymentMethods
              groups={paymentGroups}
              memberCredits={memberCredits}
              selectedPaymentId={selectedPaymentId}
              onSelectPayment={handleSelectPayment}
            />

            <PointsRedeem
              stepNumber={4}
              balance={pointsSummary?.points ?? null}
              rate={pointsRate}
              price={totalPrice}
              checked={usePoints}
              onToggle={setUsePoints}
              allowed={pointsSummary?.allows_point_spending ?? true}
            />

            <ContactDetail
              whatsapp={whatsapp}
              onWhatsappChange={setWhatsapp}
              email={email}
              onEmailChange={setEmail}
            />

            <PromoCode
              productId={selectedPackage?.productId}
              amount={selectedPackage?.price}
              applied={appliedPromo}
              onApplied={setAppliedPromo}
              onCleared={() => setAppliedPromo(null)}
            />

            <OrderSummary
              selectedPackage={selectedPackage}
              totalPrice={totalPrice}
              promoDiscount={promoDiscount}
              adminFee={adminFee}
              pointsDiscount={pointsApplied.discount}
              gameThumbnail={game.thumbnail}
              gameName={game.name}
              selectedPaymentName={selectedPayment?.name}
              userId={userId}
              serverId={serverId}
              whatsapp={whatsapp}
              nickname={nickname}
              isSubmitting={checkoutMutation.isPending}
              isCheckingPrice={isCheckingPrice}
              previousPrice={previousPrice}
              onRequestConfirm={handleRequestConfirm}
              isPreparing={isChecking}
              onSubmit={handleConfirmCheckout}
            />
          </Box>
        </Box>
      </Box>

      <Footer />
    </Box>
  );
}
