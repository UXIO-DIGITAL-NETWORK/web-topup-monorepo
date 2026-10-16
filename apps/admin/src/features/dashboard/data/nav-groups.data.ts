import type { ComponentType } from "react";
import {
  AppWindow,
  Banknote,
  ChartColumnBig,
  ClipboardList,
  FileStack,
  Folder,
  LayoutGrid,
  Layers,
  Link as LinkIcon,
  Percent,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SquareUser,
  Star,
  Tag,
  TicketPercent,
  Users2,
  Wallet,
} from "lucide-react";

export type NavItem = {
  /** A key, not a label: the menu has to move with the panel's language. */
  labelKey: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  disabled?: boolean;
};

export type NavGroup = { labelKey: string; items: NavItem[] };

/**
 * The panel's whole navigation, in one place.
 *
 * Read by the sidebar, by its command palette, and by the navbar's page title.
 * The navbar used to keep a second hand-written map of two routes and call
 * everything else "Dashboard" — deriving the title from the same list that
 * renders the menu is what stops the two drifting again.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "navGeneral",
    items: [
      { labelKey: "navDashboard", href: "/admin/dashboard", icon: LayoutGrid },
      { labelKey: "navReports", href: "/admin/reports", icon: ChartColumnBig },
      { labelKey: "navFinancial", href: "/admin/financial", icon: Wallet },
      { labelKey: "navIntegration", href: "/admin/integration", icon: LinkIcon },
      { labelKey: "navSettings", href: "/admin/settings", icon: Settings },
    ],
  },
  {
    labelKey: "navOrders",
    items: [
      { labelKey: "navTransaction", href: "/admin/transactions", icon: ShoppingCart },
      { labelKey: "navRefunds", href: "/admin/refunds", icon: RotateCcw },
      { labelKey: "navActivity", href: "/admin/activity", icon: ClipboardList },
      { labelKey: "navFeedback", href: "/admin/feedback", icon: Star },
    ],
  },
  {
    labelKey: "navProductsServices",
    items: [
      { labelKey: "navCategory", href: "/admin/categories", icon: Folder },
      { labelKey: "navProduct", href: "/admin/products", icon: Layers },
      { labelKey: "navPricingRules", href: "/admin/pricing", icon: Percent },
      { labelKey: "navPayment", href: "/admin/payments", icon: Banknote },
      { labelKey: "navMembership", href: "/admin/memberships", icon: SquareUser },
    ],
  },
  {
    labelKey: "navMarketing",
    items: [
      { labelKey: "navPromo", href: "/admin/promos", icon: TicketPercent },
      { labelKey: "navFlashSale", href: "/admin/flash-sales", icon: Tag },
      { labelKey: "navWebsiteContent", href: "/admin/content", icon: AppWindow },
      { labelKey: "navPages", href: "/admin/content/pages", icon: FileStack },
    ],
  },
  {
    labelKey: "navAdministration",
    items: [
      { labelKey: "navUsers", href: "/admin/users", icon: Users2 },
      // Account security — the authenticator this admin holds. Previously
      // reachable only by being thrown here from a failed request.
      { labelKey: "navSecurity", href: "/admin/settings/security", icon: ShieldCheck },
    ],
  },
];

/**
 * The translation key for a pathname, matched on the longest `href` that prefixes it.
 *
 * Longest-first because `/admin/content` and `/admin/content/pages` are both
 * real entries: the shorter one would otherwise claim the deeper page.
 */
export function findNavLabelKey(pathname: string): string | null {
  const items = NAV_GROUPS.flatMap((group) => group.items).sort((a, b) => b.href.length - a.href.length);
  const match = items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return match?.labelKey ?? null;
}
