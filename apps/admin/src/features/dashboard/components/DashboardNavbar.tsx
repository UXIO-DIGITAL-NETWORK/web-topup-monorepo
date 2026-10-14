import type { TFunction } from "i18next";
import { Fragment } from "react";
import { ChevronDown, HelpCircle, LogOut } from "lucide-react";
import { useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Box } from "@/components/common/Box";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationBell } from "@/components/common/NotificationBell";
import { Text } from "@/components/common/Text";
import { NavbarClock } from "@/features/dashboard/components/NavbarClock";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { LocaleSwitcher } from "@/components/common/LocaleSwitcher";
import { useAuthStore } from "@/store/useAuthStore";
import { useLogout } from "@/features/auth/hooks/useLogout";
import { findNavLabelKey } from "../data/nav-groups.data";

// Tab segment -> breadcrumb label, mirrors CategoryTabsLayout's TABS
// (features/categories/layouts/CategoryTabsLayout.tsx). Category is the only
// section with real nested routes deep enough to need a multi-segment trail
// ("Category › Sub Category", "Category › Sub Category › Add Sub Category")
// — every other route keeps the single-title lookup below.
const CATEGORY_TAB_KEYS: Record<string, string> = {
  category: "tabCategoryList",
  "sub-category": "tabSubCategory",
  "category-type": "tabCategoryType",
  "category-server": "tabCategoryServer",
  "category-provider": "tabCategoryProvider",
};

function getCategoryBreadcrumb(pathname: string, t: TFunction<"dashboard">): string[] | null {
  // "/admin/categories-preview" also starts with the substring
  // "/admin/categories", so the preview base must be checked first or every
  // preview path would resolve to the (wrong, one-segment-short) real base.
  const base = pathname.startsWith("/admin/categories-preview")
    ? "/admin/categories-preview"
    : pathname.startsWith("/admin/categories")
      ? "/admin/categories"
      : null;
  if (!base) return null;

  const segments = pathname.slice(base.length).split("/").filter(Boolean);
  const tabLabel = t(CATEGORY_TAB_KEYS[segments[0] ?? "category"] ?? "navCategory");
  const trail = [t("navCategory"), tabLabel];
  // The leaf is derived from the active tab, not hardcoded: the reference
  // showed "Add Category" on every tab's add page, which is wrong anywhere
  // but the Category tab (product_requirements.md §4.5).
  const leaf = segments[segments.length - 1];
  if (leaf === "add") trail.push(t("bcAdd", { tab: tabLabel }));
  else if (leaf === "edit") trail.push(t("bcEdit", { tab: tabLabel }));
  return trail;
}

// Tab segment -> breadcrumb label, mirrors TransactionsLayout's TABS. The
// preview seam is flat (no tab segment), and only ever renders the Automatic
// table, so an unrecognised first segment falls back to "Automatic".
const TRANSACTION_TAB_KEYS: Record<string, string> = {
  automatic: "tabAutomatic",
  manual: "tabManual",
};

function getTransactionBreadcrumb(pathname: string, t: TFunction<"dashboard">): string[] | null {
  // Same preview-first ordering caveat as getCategoryBreadcrumb, for the same
  // reason: distinct prefixes here, but keeping one shape avoids a trap later.
  const base = pathname.startsWith("/admin/transaction-preview")
    ? "/admin/transaction-preview"
    : pathname.startsWith("/admin/transactions")
      ? "/admin/transactions"
      : null;
  if (!base) return null;

  const segments = pathname.slice(base.length).split("/").filter(Boolean);
  const trail = [t("navTransaction"), t(TRANSACTION_TAB_KEYS[segments[0] ?? "automatic"] ?? "tabAutomatic")];
  if (segments[segments.length - 1] === "edit") trail.push(t("editTransaction"));
  return trail;
}

// Tab segment -> breadcrumb label, mirrors ProductTabsLayout's TAB_SEGMENTS.
const PRODUCT_TAB_KEYS: Record<string, string> = {
  main: "tabMainProducts",
  archived: "tabArchived",
  provider: "tabProductProvider",
  "price-log": "tabPriceChangeLog",
};

function getProductBreadcrumb(pathname: string, t: TFunction<"dashboard">): string[] | null {
  // "/admin/products-preview" also starts with "/admin/products", so the
  // preview base must be tested first — the same trap as getCategoryBreadcrumb.
  const base = pathname.startsWith("/admin/products-preview")
    ? "/admin/products-preview"
    : pathname.startsWith("/admin/products")
      ? "/admin/products"
      : null;
  if (!base) return null;

  const segments = pathname.slice(base.length).split("/").filter(Boolean);
  const tabLabel = t(PRODUCT_TAB_KEYS[segments[0] ?? "main"] ?? "navProduct");
  const trail = [t("navProduct"), tabLabel];
  const leaf = segments[segments.length - 1];
  if (leaf === "add") trail.push(t("bcAdd", { tab: tabLabel }));
  else if (leaf === "edit") trail.push(t("bcEdit", { tab: tabLabel }));
  return trail;
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/**
 * The title for a route, taken from the sidebar's own navigation list.
 *
 * This used to be a hand-written map of two paths with everything else falling
 * through to the literal "Dashboard" — so `/admin/users`, `/admin/refunds` and
 * every other screen announced itself as the dashboard, in the breadcrumb and
 * to screen readers alike. `NAV_GROUPS` already names every route the menu can
 * reach, so reading it is what keeps the two from drifting apart again.
 *
 * "Dashboard" survives as the fallback for a path the menu does not list at
 * all, which is better than an empty bar.
 */
function getPageTitle(pathname: string, t: TFunction<"dashboard">) {
  const key = findNavLabelKey(pathname);

  return key ? t(key) : t("navDashboard");
}

export function DashboardNavbar() {
  const { t } = useTranslation("navbar");
  // The breadcrumb names routes, and those labels live with the menu that
  // defines them (`nav-groups.data.ts`) rather than with the navbar's own
  // chrome — so it needs both namespaces.
  const { t: tNav } = useTranslation("dashboard");
  const user = useAuthStore((state) => state.user);
  const { pathname } = useLocation();
  // `useLogout` revokes the token server-side before clearing the cookies. The
  // navbar used to do only the second half by hand, which left a 30-day refresh
  // token alive on a panel that keeps it in a JavaScript-readable cookie.
  const logout = useLogout();

  const trail = getCategoryBreadcrumb(pathname, tNav) ??
    getTransactionBreadcrumb(pathname, tNav) ??
    getProductBreadcrumb(pathname, tNav) ?? [getPageTitle(pathname, tNav)];

  return (
    <Box
      as="header"
      className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background px-4 lg:px-6"
    >
      <Box className="flex flex-1 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        {/* One code path for both shapes: a plain page title is a trail of
            one. Rendering it as a bare span instead meant the deepest crumb and
            the ordinary title announced themselves differently to screen
            readers, and were queried differently in tests. */}
        <Breadcrumb>
          <BreadcrumbList className="flex-nowrap text-sm">
            {trail.map((label, index) => (
              <Fragment key={`${label}-${index}`}>
                <BreadcrumbItem>
                  {index === trail.length - 1 ? (
                    <BreadcrumbPage className="font-medium">{label}</BreadcrumbPage>
                  ) : (
                    label
                  )}
                </BreadcrumbItem>
                {index < trail.length - 1 && <BreadcrumbSeparator />}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </Box>

      <Box className="flex items-center gap-1">
        <NavbarClock />
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-md text-muted-foreground"
        >
          <HelpCircle className="size-4" />
          <Text
            as="span"
            className="sr-only"
          >
            {t("help")}
          </Text>
        </Button>
        {/* The slot product_requirements.md §78 reserved for a
            "language/utility action". It shipped as a lightning icon with no
            handler; this fills it with the purpose it was specced for. */}
        <LocaleSwitcher />
        <ThemeToggle />
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              aria-label={t("openUserMenu")}
              className="ml-1 h-auto items-center gap-2 rounded-md px-2 py-1.5"
            >
              <Avatar size="sm">
                <AvatarFallback>{user ? getInitials(user.name) : ""}</AvatarFallback>
              </Avatar>
              <Box className="hidden flex-col items-start text-left sm:flex">
                <Text
                  as="span"
                  className="text-sm leading-tight font-medium text-foreground"
                >
                  {user?.name}
                </Text>
                <Text
                  as="span"
                  className="text-xs leading-tight text-muted-foreground"
                >
                  {user?.email}
                </Text>
              </Box>
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
              variant="destructive"
            >
              <LogOut className="mr-2 size-4" />
              {logout.isPending ? t("loggingOut") : t("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Box>
    </Box>
  );
}
