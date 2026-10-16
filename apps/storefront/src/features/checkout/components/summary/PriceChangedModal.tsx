import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/format";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  productName: string;
  /** What the buyer was quoted. */
  previousPrice: number;
  /** What they will be charged if they go ahead. */
  newPrice: number;
}

/**
 * "The price went up — still want it?"
 *
 * Shown only for an increase: a price that fell, or one that did not move at
 * all, is not worth a dialog. The two numbers are both on screen on purpose —
 * asking "are you sure?" without saying what changed would make the buyer dig
 * for the difference themselves.
 */
export default function PriceChangedModal({
  isOpen,
  onClose,
  onConfirm,
  productName,
  previousPrice,
  newPrice,
}: Props): React.ReactPortal | null {
  const { t, i18n } = useTranslation("checkout");
  const locale = i18n.language;

  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <Box
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <Box
        className="w-full max-w-md p-px rounded-2xl bg-linear-to-r from-[#3B82F6] to-[#9333EA] shadow-glow-violet"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Box
          role="dialog"
          aria-modal="true"
          aria-label={t("priceChangedModal.title")}
          className="rounded-[15px] bg-[rgba(42,4,98,0.82)] p-6 flex flex-col gap-5"
        >
          <Box className="flex flex-col gap-2">
            <Text
              as="span"
              className="font-outfit font-bold text-[20px] text-white leading-tight uppercase"
            >
              {t("priceChangedModal.title")}
            </Text>
            <Text as="span" className="font-inter text-[13px] text-white/55 leading-snug">
              {t("priceChangedModal.subtitle")}
            </Text>
          </Box>

          <Box className="rounded-2xl border border-[rgba(147,51,234,0.5)] bg-[rgba(88,28,135,0.35)] overflow-hidden">
            <Box className="flex items-center gap-3 px-4 pt-4 pb-3">
              <Box className="w-6 h-px bg-white/40 shrink-0" />
              <Text
                as="span"
                className="font-outfit font-bold text-[13px] text-white leading-none"
              >
                {t("priceChangedModal.orderSummary")}
              </Text>
            </Box>

            <Box className="px-4 pb-4 flex flex-col gap-3">
              <Box className="flex items-center justify-between gap-4">
                <Text as="span" className="font-inter text-[13px] text-white/55 leading-none">
                  {t("priceChangedModal.product")}
                </Text>
                <Text
                  as="span"
                  className="text-[13px] leading-none text-right font-inter font-medium text-white"
                >
                  {productName}
                </Text>
              </Box>

              <Box className="flex items-center justify-between gap-4">
                <Text as="span" className="font-inter text-[13px] text-white/55 leading-none">
                  {t("priceChangedModal.previousPrice")}
                </Text>
                <Text
                  as="span"
                  className="font-plex text-[13px] leading-none text-white/50 line-through"
                >
                  {formatCurrency(previousPrice, locale)}
                </Text>
              </Box>

              <Box className="h-px bg-white/10" />

              <Box className="flex items-center justify-between gap-4">
                <Text as="span" className="font-inter text-[13px] text-white/55 leading-none">
                  {t("priceChangedModal.newPrice")}
                </Text>
                <Text
                  as="span"
                  className="font-plex font-bold text-[16px] leading-none text-violet-lavender"
                >
                  {formatCurrency(newPrice, locale)}
                </Text>
              </Box>
            </Box>
          </Box>

          <Box className="flex flex-col gap-3">
            <Button type="button" className="w-full py-3 text-[15px]" onClick={onConfirm}>
              {t("priceChangedModal.confirm")}
            </Button>

            <button
              type="button"
              className="w-full rounded-[50px] border border-white/15 bg-white/5 py-3 font-outfit font-semibold text-[15px] text-white/80 cursor-pointer hover:bg-white/10 transition-colors"
              onClick={onClose}
            >
              {t("priceChangedModal.cancel")}
            </button>
          </Box>
        </Box>
      </Box>
    </Box>,
    document.body,
  );
}
