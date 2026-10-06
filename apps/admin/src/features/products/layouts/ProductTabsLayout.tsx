import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "@tanstack/react-router";

import { Box } from "@/components/common/Box";
import { Link } from "@/components/common/Link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Two URL-driven tabs (product_requirements.md §4.6) — real nested routes, not
 * client state, so the breadcrumb and back button reflect the active tab. Same
 * pattern as `TransactionsLayout`, which also has two.
 *
 * There is no "Product Provider" tab any more. It existed to hold the pool —
 * a staging list of picked SKUs waiting to be promoted — and the pool is gone:
 * picking from a provider now creates a draft product on the Main Products tab
 * directly. The provider routes still exist for operators who land on them by
 * URL, but nothing in the panel points at them.
 *
 * Segments are `main`/`price-log` rather than the full label kebab, following
 * the two-tab Transactions precedent (`automatic`/`manual`).
 */
const TAB_SEGMENTS = [
  { value: "main", labelKey: "tabMainProducts", segment: "main" },
  { value: "price-log", labelKey: "tabPriceChangeLog", segment: "price-log" },
];

const PREVIEW_BASE = "/admin/products-preview";
const REAL_BASE = "/admin/products";

/**
 * Two URL-driven tabs (product_requirements.md §4.6) — real nested routes, not
 * client state, so the breadcrumb and back button reflect the active tab. Same
 * pattern as `TransactionsLayout`, which also has two.
 *
 * Segments are `main`/`provider` rather than the full label kebab, following
 * the two-tab Transactions precedent (`automatic`/`manual`); the five-tab
 * Categories layout spells its segments out because its labels are unique
 * nouns rather than qualifiers of the feature name.
 */
export function ProductTabsLayout() {
  const { t } = useTranslation("products");
  // `/admin/products-preview` also starts with `/admin/products`, so the
  // preview base must be tested first.
  const { pathname } = useLocation();
  const base = pathname.startsWith(PREVIEW_BASE) ? PREVIEW_BASE : REAL_BASE;
  const activeSegment = pathname.slice(base.length).split("/").filter(Boolean)[0];
  const activeTab = TAB_SEGMENTS.find((tab) => tab.segment === activeSegment)?.value ?? "main";
  // Form/action routes render standalone (no tab bar): the add flows plus the
  // dedicated Set Profit Margin / Set Price Limit pages.
  const onFormRoute =
    pathname.endsWith("/add") ||
    pathname.endsWith("/edit") ||
    pathname.includes("/set-profit-margin") ||
    pathname.includes("/set-price-limit");
  // Only the Add Products page pins its own height (table scrolls inside the
  // page instead of the page scrolling). Scoped to that one route so the other
  // standalone pages keep scrolling normally.
  const isAddProductsRoute = pathname.endsWith("/main/add");

  return (
    <Box className={cn("flex flex-col gap-6", isAddProductsRoute && "h-full min-h-0")}>
      {!onFormRoute && (
        <Tabs value={activeTab}>
          <TabsList variant="line">
            {TAB_SEGMENTS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                asChild
              >
                <Link href={`${base}/${tab.segment}`}>{t(tab.labelKey)}</Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <Outlet />
    </Box>
  );
}
