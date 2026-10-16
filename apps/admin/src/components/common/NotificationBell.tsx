import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Bell, CalendarClock, RotateCcw } from "lucide-react";

import { Box } from "@/components/common/Box";
import { Link } from "@/components/common/Link";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/date";

import {
  useMarkAllNotificationsRead,
  useNotificationUnreadCount,
  useNotifications,
  useNotificationsRealtime,
} from "@/hooks/useNotifications";
import type { AdminNotification } from "@/types/notification.type";

/**
 * Per-type glyph, so the feed is scannable without reading it. An unknown type
 * falls back to the bell rather than being dropped — a notification this panel
 * cannot name is still one the admin should see.
 */
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "refund.claimed": RotateCcw,
  subscription_expiring: CalendarClock,
};

export const NOTIFICATIONS_HREF = "/admin/notifications";

/**
 * The navbar bell.
 *
 * It was a `<Button>` with an icon and no handler — no badge, no dropdown, no
 * request. Meanwhile `ClaimRefundWithAccountAction` had been writing rows
 * addressed to role `admin` on every refund claim, and the routes to read them
 * existed only under `v1/payment-internal`. The data was there; the door was
 * not.
 */
export function NotificationBell() {
  const { t } = useTranslation("notifications");
  // Mounted in the navbar, so this is the one subscription for the whole panel.
  useNotificationsRealtime();
  const { data: unreadCount = 0 } = useNotificationUnreadCount();
  // First page only — the dropdown is a preview, the page is the full list.
  const { data, isLoading } = useNotifications({ per_page: 6 });
  const markAll = useMarkAllNotificationsRead();

  const rows = data?.data ?? [];
  const hasUnread = unreadCount > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9 rounded-md text-muted-foreground"
          aria-label={hasUnread ? t("bell.labelUnread", { count: unreadCount }) : t("bell.label")}
        >
          <Bell className="size-4" />
          {hasUnread && (
            <Box
              as="span"
              aria-hidden
              className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Box>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 p-0"
      >
        <Box className="flex items-center justify-between border-b border-border px-4 py-3">
          <Text
            as="span"
            className="text-sm font-medium text-foreground"
          >
            {t("bell.heading")}
          </Text>
          {hasUnread && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              {t("bell.markAll")}
            </Button>
          )}
        </Box>

        <ScrollArea className="max-h-80">
          {isLoading ? (
            <Text className="px-4 py-6 text-center text-sm text-muted-foreground">{t("bell.loading")}</Text>
          ) : rows.length === 0 ? (
            <Text className="px-4 py-6 text-center text-sm text-muted-foreground">{t("bell.empty")}</Text>
          ) : (
            rows.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
              />
            ))
          )}
        </ScrollArea>

        <Box className="border-t border-border p-2">
          <Link
            href={NOTIFICATIONS_HREF}
            className="block rounded-md px-2 py-1.5 text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {t("bell.viewAll")}
          </Link>
        </Box>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationRow({ notification }: { notification: AdminNotification }) {
  const Icon = ICONS[notification.type] ?? Bell;

  return (
    <Box
      className={cn(
        "flex gap-3 border-b border-border/60 px-4 py-3 last:border-0",
        !notification.isRead && "bg-muted/50",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <Box className="flex min-w-0 flex-col gap-0.5">
        <Text
          as="span"
          className="truncate text-sm font-medium text-foreground"
        >
          {notification.title}
        </Text>
        <Text
          as="span"
          className="line-clamp-2 text-xs text-muted-foreground"
        >
          {notification.message}
        </Text>
        {notification.createdAt && (
          <Text
            as="span"
            className="text-[11px] text-muted-foreground"
          >
            {formatRelativeTime(notification.createdAt)}
          </Text>
        )}
      </Box>
    </Box>
  );
}
