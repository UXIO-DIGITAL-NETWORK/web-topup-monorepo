import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import { useSidebar } from "@/hooks/useSidebar";
import { cn } from "@/lib/utils";
import { formatDate } from "@/utils/date";
import { useWebsiteSubscription } from "../hooks/useWebsiteSubscription";

/**
 * The site's own subscription, in the sidebar footer.
 *
 * Kept short on purpose: the service's name, one status line, and the way out.
 * The status line is the only part that changes colour — green while the term
 * holds, warning when it is about to lapse, destructive once it has.
 *
 * The button leaves for the payment panel, where the client signs in with their
 * own payment-admin account — every route there is behind a login, so it opens
 * in a new tab rather than pretending to be an in-app action. The card sits in
 * the client's own panel, so the title is the service the API names, never a
 * hardcoded brand.
 *
 * Collapsed state is handled by the sidebar's own `group-data-[collapsible=icon]`
 * utilities rather than by branching on the sidebar state for layout; the state
 * is read only to keep the collapsed rail's tooltip.
 */
export function WebsiteSubscriptionCard() {
  const { t } = useTranslation("dashboard");
  const { data } = useWebsiteSubscription();
  const { state, isMobile } = useSidebar();

  // Still loading: render nothing rather than a card that says "—" on every
  // page. An unconfigured site still gets the card, with the button disabled.
  if (!data) return null;

  const tone =
    data.status === "expiring_soon"
      ? "text-warning"
      : data.status === "active"
        ? "text-success"
        : data.status === "unconfigured"
          ? "text-muted-foreground"
          : "text-destructive";

  const summary =
    // A suspension outranks the date: the storefront is already refusing
    // customers, and "300 hari tersisa" here would be the one screen that
    // should explain the outage denying it instead.
    data.status === "suspended"
      ? (data.suspend_reason ?? t("siteDisabled"))
      : data.status === "unconfigured"
        ? t("subscriptionUnconfigured")
        : data.status === "expired"
          ? t("subscriptionExpired")
          : data.status === "none"
            ? t("subscriptionNone")
            : data.lifetime
              ? // Nothing to count down to, and nothing to renew — saying a number
                // of days here would invent a deadline the client does not have.
                t("subscriptionLifetime")
              : data.status === "expiring_soon"
                ? t("subscriptionDaysRemaining", { days: data.days_remaining })
                : t("licenceActiveUntil", { date: formatDate(data.ends_at) });

  const name = data.service?.name ?? t("websiteSubscription");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Box
          className="rounded-xl border border-border bg-sidebar group-data-[collapsible=icon]:border-0"
          title={state === "collapsed" && !isMobile ? `${name} — ${summary}` : undefined}
        >
          <CalendarClock className={cn("hidden size-4 shrink-0 group-data-[collapsible=icon]:block", tone)} />
          <Box className="flex flex-col gap-1.5 px-4 pt-4 group-data-[collapsible=icon]:hidden">
            <Text
              as="span"
              className="text-sm leading-normal font-semibold"
            >
              {name}
            </Text>
            <Text
              as="span"
              className={cn("flex items-center gap-2 text-xs font-medium", tone)}
            >
              <Box
                as="span"
                aria-hidden
                className="size-1 shrink-0 rounded-full bg-current"
              />
              {summary}
            </Text>
          </Box>
          <Box className="p-4 group-data-[collapsible=icon]:hidden">
            {data.checkout_url ? (
              <Button
                asChild
                className="w-full"
              >
                <a
                  href={data.checkout_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("subscriptionCheck")}
                </a>
              </Button>
            ) : (
              <Button
                disabled
                className="w-full"
              >
                {t("subscriptionCheck")}
              </Button>
            )}
          </Box>
        </Box>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
