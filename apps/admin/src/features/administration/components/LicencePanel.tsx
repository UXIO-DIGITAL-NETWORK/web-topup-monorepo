import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";

import { Box } from "@/components/common/Box";
import { EmptyState } from "@/components/common/EmptyState";
import { Text } from "@/components/common/Text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWebsiteSubscription } from "@/features/dashboard/hooks/useWebsiteSubscription";
import { cn } from "@/lib/utils";
import { formatWib } from "@/utils/date";

/** Label on the left, read-only value on the right. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box className="flex items-center justify-between gap-4 py-3">
      <Text
        as="span"
        variant="muted"
        className="text-sm"
      >
        {label}
      </Text>
      <Text
        as="span"
        className="text-right text-sm tabular-nums"
      >
        {children}
      </Text>
    </Box>
  );
}

/**
 * This site's licence, read-only.
 *
 * Reported from `GET /v1/website-subscription` — the same answer the sidebar
 * card gives — rather than from the `licence` settings rows. The Hub owns those
 * and rewrites them every five minutes, so showing them as editable fields
 * invited an edit that would be silently reversed; and until it was,
 * `is_serving` decides whether the storefront answers at all. The API refuses
 * to write them for the same reason.
 */
export function LicencePanel() {
  const { t } = useTranslation("administration");
  const { data, isLoading, isFetching, refetch } = useWebsiteSubscription();

  if (isLoading) return <Text variant="muted">{t("loadingSettings")}</Text>;

  if (!data || data.status === "unconfigured") {
    return (
      <EmptyState
        title={t("licenceEmptyTitle")}
        description={t("licenceUnconfigured")}
        action={
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            {t("licenceRecheck")}
          </Button>
        }
      />
    );
  }

  const urgent = data.status === "expired" || data.status === "expiring_soon" || data.status === "suspended";

  return (
    <Box className="flex flex-col gap-4">
      <Box className="flex flex-col divide-y divide-border rounded-xl border border-border px-4">
        <Row label={t("licenceStatus")}>
          <Badge
            variant="outline"
            className={cn(urgent ? "text-warning" : "text-success")}
          >
            {t(`licenceStatus_${data.status}`)}
          </Badge>
        </Row>

        {/* A licence bought outright has no end date to show and no countdown to
            run — the row says so instead of leaving the panel looking empty. */}
        {data.lifetime ? (
          <Row label={t("licenceEndsAt")}>{t("licenceLifetime")}</Row>
        ) : (
          <>
            {data.ends_at && <Row label={t("licenceEndsAt")}>{formatWib(data.ends_at, "d MMMM yyyy")}</Row>}

            {data.days_remaining !== null && data.status !== "suspended" && (
              <Row label={t("licenceDaysRemaining")}>{t("licenceDays", { days: data.days_remaining })}</Row>
            )}
          </>
        )}

        {data.suspend_reason && <Row label={t("licenceSuspendReason")}>{data.suspend_reason}</Row>}
      </Box>

      {data.checkout_url && (
        <Box>
          <Button
            asChild
            variant="outline"
            className="rounded-xl"
          >
            <a
              href={data.checkout_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("licenceRenew")}
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </Box>
      )}
    </Box>
  );
}
