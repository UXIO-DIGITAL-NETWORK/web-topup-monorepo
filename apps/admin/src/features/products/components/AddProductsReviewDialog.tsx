import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle } from "lucide-react";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/currency";
import { MarginSimulationCard } from "./MarginSimulationCard";
import type { ReviewItem, ReviewPlanPrice } from "../lib/reviewProducts";

const EM_DASH = "—";
const rupiah = (value: number) => formatCurrency(value, { fractionDigits: 0 });

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box className="flex items-start justify-between gap-4 py-1.5">
      <Text
        as="span"
        variant="muted"
        className="text-sm"
      >
        {label}
      </Text>
      <Box className="flex items-center gap-2 text-right">{children}</Box>
    </Box>
  );
}

function Value({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Text
      as="span"
      className={cn("text-sm text-foreground tabular-nums", className)}
    >
      {children}
    </Text>
  );
}

function Section({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <Box className="flex flex-col gap-1">
      <Text
        as="span"
        variant="muted"
        className="text-xs font-medium tracking-wide uppercase"
      >
        {caption}
      </Text>
      <Box className="flex flex-col divide-y divide-border">{children}</Box>
    </Box>
  );
}

function ReadinessBadge({ item }: { item: ReviewItem }) {
  const { t } = useTranslation("products");
  if (item.blocked) {
    return (
      <Badge
        variant="outline"
        className="border-destructive/30 bg-destructive/10 text-destructive"
      >
        {t("reviewBlocked")}
      </Badge>
    );
  }
  if (item.issues.length > 0) {
    return (
      <Badge
        variant="outline"
        className="border-warning/30 bg-warning/10 text-warning"
      >
        {t("reviewWarning")}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-success/30 bg-success/10 text-success"
    >
      {t("reviewReady")}
    </Badge>
  );
}

export interface AddProductsReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Draft or publish — decides the copy and the banner, not the payload. */
  publish: boolean;
  items: ReviewItem[];
  onConfirm: () => void;
  isPending?: boolean;
}

/**
 * The last look before products leave for the catalogue: every selected product
 * with the data that was filled in, the price each plan will sell at, its mix
 * components, and a readiness badge. Confirmation is blocked while a product is
 * missing something essential — the send itself happens in the page.
 */
export function AddProductsReviewDialog({
  open,
  onOpenChange,
  publish,
  items,
  onConfirm,
  isPending = false,
}: AddProductsReviewDialogProps) {
  const { t } = useTranslation("products");

  const blockedItems = items.filter((item) => item.blocked);
  const blockedAny = blockedItems.length > 0;

  const marginSourceLabel = (plan: ReviewPlanPrice) => {
    if (plan.source === "margin") return t("reviewMarginSourceMargin", { percent: plan.margin });
    if (plan.source === "rule") return t("reviewMarginSourceRule", { percent: plan.rulePercent });
    return t("reviewMarginSourceCost");
  };

  const discountLabel = (item: ReviewItem) => {
    if (item.discountType === "" || item.discountValue === null) return EM_DASH;
    return item.discountType === "percent" ? `${item.discountValue}%` : rupiah(item.discountValue);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{publish ? t("reviewPublishTitle") : t("reviewDraftTitle")}</DialogTitle>
          <DialogDescription>{t("reviewSubtitle", { n: items.length })}</DialogDescription>
        </DialogHeader>

        <Box
          className={cn(
            "flex items-start gap-2 rounded-xl border px-3 py-2",
            publish ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <Text
            as="span"
            variant="small"
          >
            {publish ? t("reviewPublishWarning") : t("reviewDraftNote")}
          </Text>
        </Box>

        {blockedAny && (
          <Box className="flex flex-col gap-1 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2">
            <Box className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <Text
                as="span"
                variant="small"
                className="font-medium"
              >
                {t("reviewBlockedTitle", { n: blockedItems.length })}
              </Text>
            </Box>
            <Text
              as="span"
              variant="small"
              className="text-destructive/90"
            >
              {t("reviewBlockedHint")}
            </Text>
            <Text
              as="span"
              variant="small"
              className="text-destructive/90"
            >
              {blockedItems.map((item) => item.name || item.buyerSkuCode).join(", ")}
            </Text>
          </Box>
        )}

        <Accordion
          type="multiple"
          defaultValue={items[0] ? [items[0].buyerSkuCode] : []}
          className="flex flex-col gap-2"
        >
          {items.map((item) => (
            <AccordionItem
              key={item.buyerSkuCode}
              value={item.buyerSkuCode}
              className="rounded-xl border border-border px-3 last:border-b"
            >
              <AccordionTrigger className="py-3">
                <Box className="flex flex-1 flex-wrap items-center justify-between gap-3 pr-2">
                  <Box className="flex flex-col items-start gap-0.5">
                    <Text
                      as="span"
                      className="font-medium"
                    >
                      {item.name || item.buyerSkuCode}
                    </Text>
                    <Text
                      as="span"
                      variant="small"
                      className="text-muted-foreground"
                    >
                      {item.buyerSkuCode}
                      {item.providerName ? ` · ${item.providerName}` : ""}
                    </Text>
                  </Box>
                  <Box className="flex items-center gap-2">
                    <ReadinessBadge item={item} />
                    <Text
                      as="span"
                      className="font-medium tabular-nums"
                    >
                      {rupiah(item.defaultPlan?.price ?? item.accumulated)}
                    </Text>
                  </Box>
                </Box>
              </AccordionTrigger>

              <AccordionContent className="flex flex-col gap-4">
                <Section caption={t("reviewSectionData")}>
                  <Row label={t("productName")}>
                    <Value>{item.name || EM_DASH}</Value>
                  </Row>
                  <Row label={t("subName")}>
                    <Value>{item.subName || EM_DASH}</Value>
                  </Row>
                  <Row label={t("category")}>
                    <Value>{item.categoryName || EM_DASH}</Value>
                  </Row>
                  <Row label={t("subCategory")}>
                    <Value>{item.subCategoryName || EM_DASH}</Value>
                  </Row>
                  <Row label={t("productLogo")}>
                    <Value>{item.hasLogo ? t("active") : EM_DASH}</Value>
                  </Row>
                  <Row label={t("discount")}>
                    <Value>{discountLabel(item)}</Value>
                  </Row>
                  <Row label={t("pointsPercent")}>
                    <Value>{item.pointPercent ?? EM_DASH}</Value>
                  </Row>
                  <Row label={t("bonusPoints")}>
                    <Value>{item.pointFlat ?? EM_DASH}</Value>
                  </Row>
                  <Row label={t("lowerLimit")}>
                    <Value>{item.priceMin !== null ? rupiah(item.priceMin) : EM_DASH}</Value>
                  </Row>
                  <Row label={t("upperLimit")}>
                    <Value>{item.priceMax !== null ? rupiah(item.priceMax) : EM_DASH}</Value>
                  </Row>
                </Section>

                <Section caption={t("reviewSectionPricing")}>
                  <Box className="py-2">
                    <MarginSimulationCard
                      cost={item.accumulated}
                      rows={item.planPrices.map((plan) => ({
                        key: plan.planValue,
                        label: `${plan.label} (%)`,
                        price: plan.price,
                      }))}
                      breakdown={item.mixCost > 0 ? { main: item.cost, mix: item.mixCost } : undefined}
                    />
                  </Box>
                  {item.planPrices.map((plan) => (
                    <Row
                      key={plan.planValue}
                      label={`${plan.label} (%)`}
                    >
                      <Value className="text-muted-foreground">{marginSourceLabel(plan)}</Value>
                      <Value className="font-medium">{rupiah(plan.price)}</Value>
                    </Row>
                  ))}
                </Section>

                <Section caption={t("reviewSectionMix")}>
                  {item.mix.length === 0 ? (
                    <Box className="py-1.5">
                      <Text
                        as="span"
                        variant="muted"
                        className="text-sm"
                      >
                        {t("reviewNoMix")}
                      </Text>
                    </Box>
                  ) : (
                    <>
                      {item.mix.map((line, index) => (
                        <Row
                          key={`${line.name}-${index}`}
                          label={`${line.name}${line.code ? ` — ${line.code}` : ""}`}
                        >
                          <Value className="text-muted-foreground">×{line.quantity}</Value>
                          <Value>{rupiah(line.cost)}</Value>
                        </Row>
                      ))}
                      <Row label={t("mixCostNote")}>
                        <Value className="font-medium">{rupiah(item.mixCost)}</Value>
                      </Row>
                    </>
                  )}
                </Section>

                {item.issues.length > 0 && (
                  <Box className="flex flex-col gap-1 rounded-xl border border-border bg-muted/30 px-3 py-2">
                    {item.issues.map((issue, index) => (
                      <Box
                        key={`${issue.messageKey}-${index}`}
                        className={cn(
                          "flex items-start gap-2",
                          issue.level === "block" ? "text-destructive" : "text-warning",
                        )}
                      >
                        {issue.level === "block" ? (
                          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        ) : (
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        )}
                        <Text
                          as="span"
                          variant="small"
                        >
                          {t(issue.messageKey, issue.params)}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            className="rounded-xl"
            disabled={blockedAny || isPending}
            onClick={onConfirm}
          >
            {isPending ? t("reviewProcessing") : publish ? t("reviewConfirmPublish") : t("reviewConfirmDraft")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
