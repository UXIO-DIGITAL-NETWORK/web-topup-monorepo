import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Navbar } from "@/components/shared/Navbar";
import { Footer } from "@/components/shared/Footer";
import { useCheckoutStore } from "@/store/useCheckoutStore";
import PaymentWaitingHero from "@/features/invoice/components/PaymentWaitingHero";
import CountdownCard from "@/features/invoice/components/CountdownCard";
import OrderDetailCard from "@/features/invoice/components/OrderDetailCard";
import PaymentInstructionsCard from "@/features/invoice/components/PaymentInstructionsCard";
import PaymentMethodCard from "@/features/invoice/components/PaymentMethodCard";
import { useInvoiceQuery } from "@/features/invoice/hooks/useInvoiceQuery";
import { useInvoiceRealtime } from "@/features/invoice/hooks/useInvoiceRealtime";
import { toOrder } from "@/features/invoice/lib/toOrder";

export default function InvoicePage(): React.JSX.Element {
  const { invoiceNumber, locale } = useParams({ strict: false }) as {
    invoiceNumber: string;
    locale: string;
  };
  const navigate = useNavigate();
  const { t } = useTranslation("invoice");
  const pendingOrder = useCheckoutStore((s) => s.pendingOrder);

  const { data: invoice } = useInvoiceQuery(invoiceNumber);
  // Push updates over the public invoice channel; the poll above is the fallback.
  useInvoiceRealtime(invoiceNumber);

  // Payment is confirmed by a gateway webhook the browser cannot observe, so
  // the poll is what moves the customer on. Redirect once nothing more will
  // change.
  useEffect(() => {
    if (!invoice?.is_terminal) return;

    void navigate({
      to:
        invoice.status === "COMPLETED"
          ? "/$locale/invoice/$invoiceNumber/success"
          : "/$locale/invoice/$invoiceNumber/failed",
      params: { locale: locale ?? "id", invoiceNumber },
      replace: true,
    });
  }, [invoice?.is_terminal, invoice?.status, invoiceNumber, locale, navigate]);

  // The store seeds the first paint straight after checkout; the server's copy
  // replaces it as soon as the query resolves, and is the only source on a
  // direct visit or a refresh.
  const order = invoice
    ? toOrder(invoice)
    : pendingOrder?.invoiceNumber === invoiceNumber
      ? pendingOrder
      : null;

  return (
    <Box className="min-h-dvh bg-[#0A0A0C]">
      <Navbar />

      {/* Hero + countdown — centered, full-width */}
      <Box className="flex flex-col items-center gap-6 px-4 pb-8">
        <PaymentWaitingHero />
        <CountdownCard expiresAt={invoice?.expires_at ?? null} />
      </Box>

      {/* Two-column content */}
      <Box className="max-w-6xl mx-auto px-4 md:px-8 pb-16">
        <Box className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

          {/* Left column: order detail + instructions */}
          <Box className="flex flex-col gap-5">
            {order && <OrderDetailCard order={order} />}

            {/* A mix arrives in parts, and the status block above can only say
                "processing" for all of them. Shown only when there is more than
                one part — a plain order would just be repeating itself. */}
            {invoice && invoice.components && invoice.components.length > 1 && (
              <Box className="rounded-2xl border border-[rgba(147,51,234,0.35)] bg-[#0D1117] px-4 py-3 flex flex-col gap-2">
                <Text as="p" className="font-outfit font-bold text-[13px] text-white">
                  {t("parts.title")}
                </Text>
                {invoice.components.map((part, index) => (
                  <Box
                    key={`${part.name ?? "part"}-${index}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <Text as="span" className="font-inter text-[13px] text-white/70 leading-snug">
                      {part.name ?? "—"}
                    </Text>
                    <Text
                      as="span"
                      className={[
                        "font-plex text-[12px] whitespace-nowrap",
                        part.status === "DELIVERED" ? "text-emerald-400" : "",
                        part.status === "REJECTED" || part.status === "UNDELIVERED" ? "text-rose-400" : "",
                      ].join(" ")}
                    >
                      {part.sn ??
                        (part.status === "DELIVERED"
                          ? t("parts.delivered")
                          : part.status === "REJECTED" || part.status === "UNDELIVERED"
                            ? t("parts.failed")
                            : t("parts.pending"))}
                    </Text>
                  </Box>
                ))}
              </Box>
            )}
            <PaymentInstructionsCard />
          </Box>

          {/* Right column: payment method + QR */}
          <Box>
            {invoice && (
              <PaymentMethodCard
                invoiceNumber={invoice.invoice_number}
                paymentName={invoice.payment.channel ?? ""}
                instructions={invoice.payment.instructions}
                status={invoice.status}
                paidAt={invoice.payment.paid_at}
              />
            )}
          </Box>
        </Box>
      </Box>

      <Footer />
    </Box>
  );
}
