import { useTranslation } from "react-i18next";
import { Archive, ChevronDown, Eye, ImageIcon, Plus, RefreshCcw, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { Box } from "@/components/common/Box";
import { BulkActionsMenu } from "@/components/common/BulkActionsMenu";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRICE_RANGE_OPTIONS } from "../data/select-options.data";
import { useProductSelectOptions } from "../hooks/useProductSelectOptions";
import { PUBLISH_STATE_LABELS, PUBLISH_STATES } from "../types/product.type";

const CLEAR_VALUE = "all";

// Archived is reached through its own button, not the Status dropdown — it is a
// "where did it go" view, not a lifecycle state an admin picks while browsing.
const LIFECYCLE_STATES = PUBLISH_STATES.filter((state) => state !== "archived");

interface MainProductToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  category?: string;
  publishState?: string;
  onCategoryChange: (value: string | undefined) => void;
  price?: string;
  onPriceChange: (value: string | undefined) => void;
  /** true shows only products switched off upstream — the archive candidates. */
  providerInactive?: boolean;
  onProviderInactiveChange: (value: boolean) => void;
  onRefresh: () => void;
  /** Add Products, in one modal: one product, or many. */
  onAddSingle: () => void;
  onAddBulk: () => void;
  selectedCount: number;
  onBulkUxiolabs: () => void;
  onBulkShowPrice: () => void;
  onPublishStateChange: (value?: string) => void;
  onBulkUnpublish: () => void;
  onBulkArchive: () => void;
}

/**
 * Toolbar for the Main Products list (product_requirements.md §4.6) — search,
 * a category filter, a status filter, a price filter, refresh, and "+ Add Main Products",
 * matching the reference left to right, with the selection action bar
 * (Uxiolabs / Logo / Unpublish) on its own right-aligned row below. There is no
 * Archive there any more: taking a product off sale is Unpublish — "Unlistis" —
 * and the row itself is never removed (order history resolves against it).
 *
 * "+ Add Main Products" offers two ways in: **Single** (one product) and
 * **Bulk** (many). Both open the same modal, where the data is filled in and the
 * product is either published or left as a draft — there is no separate "add,
 * then go and configure it" step, and no manual (supplier-less) entry.
 *
 * The add link derives its target from the current pathname rather than a
 * hardcoded absolute path, so the same component works under both the real
 * route and the unauthenticated preview twin.
 *
 * The lifecycle entry is "Unpublish" — one verb for taking a product off sale,
 * matching the row menu. It was "Deactive", which only moved half of what makes
 * a product sellable.
 */
export function MainProductToolbar({
  search,
  onSearchChange,
  category,
  publishState,
  onCategoryChange,
  price,
  onPriceChange,
  providerInactive,
  onProviderInactiveChange,
  onRefresh,
  onAddSingle,
  onAddBulk,
  selectedCount,
  onBulkUxiolabs,
  onBulkShowPrice,
  onPublishStateChange,
  onBulkUnpublish,
  onBulkArchive,
}: MainProductToolbarProps) {
  const { t } = useTranslation("products");
  // The same source the product form, bulk-add and provider pool already read,
  // so every category select in this feature agrees on what exists.
  const { categoryOptions } = useProductSelectOptions();

  // Edit Logo (bulk) still waits on the product image endpoint (§5); it says so
  // rather than guessing a mutation.
  const announceDeferred = (message: string) => () => toast.info(message);

  return (
    <Box className="flex flex-col gap-3">
      <Box className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Box className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <Box className="flex flex-col gap-1.5">
            <Label htmlFor="product-search">{t("search")}</Label>
            <Box className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="product-search"
                className="w-64 rounded-xl pl-8"
                placeholder={t("searchProductName")}
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </Box>
          </Box>

          <Box className="flex flex-col gap-1.5">
            <Label htmlFor="product-category-filter">{t("category")}</Label>
            {/* `""` (not the clear sentinel) when unfiltered, so Radix renders
                the placeholder rather than the "All categories" item's label. */}
            <Select
              value={category ?? ""}
              onValueChange={(next) => onCategoryChange(next === CLEAR_VALUE ? undefined : next)}
            >
              <SelectTrigger
                id="product-category-filter"
                className="w-56 rounded-xl"
              >
                <SelectValue placeholder={t("typeToSearchCategory")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CLEAR_VALUE}>{t("allCategories")}</SelectItem>
                {categoryOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>

          <Box className="flex flex-col gap-1.5">
            <Label htmlFor="product-state-filter">{t("status")}</Label>
            {/* Lifecycle only. Archived products are excluded by default (the
                row is kept so its order history resolves), and they are reached
                through the dedicated button below rather than this select —
                mixing them here read as "another status". */}
            <Select
              value={publishState ?? ""}
              onValueChange={(next) => onPublishStateChange(next === CLEAR_VALUE ? undefined : next)}
            >
              <SelectTrigger
                id="product-state-filter"
                className="w-44 rounded-xl"
              >
                <SelectValue placeholder={t("allStatuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CLEAR_VALUE}>{t("allStatuses")}</SelectItem>
                {LIFECYCLE_STATES.map((state) => (
                  <SelectItem
                    key={state}
                    value={state}
                  >
                    {PUBLISH_STATE_LABELS[state]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>

          {/* The one way back to archived rows, on its own so it does not read
              as just another lifecycle status. It shares `publish_state` with
              the Status select, so picking one clears the other. */}
          <Box className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant={publishState === "archived" ? "default" : "outline"}
              className="rounded-xl"
              aria-pressed={publishState === "archived"}
              onClick={() => onPublishStateChange(publishState === "archived" ? undefined : "archived")}
            >
              <Archive className="size-4" />
              {t("archived")}
            </Button>
          </Box>

          <Box className="flex flex-col gap-1.5">
            <Label htmlFor="product-availability-filter">{t("providerAvailability")}</Label>
            {/* The archive flow's entry point: a product whose provider SKU the
                checker switched off. Orthogonal to lifecycle, so it is its own
                select rather than a PUBLISH_STATES option. */}
            <Select
              value={providerInactive ? "inactive" : ""}
              onValueChange={(next) => onProviderInactiveChange(next === "inactive")}
            >
              <SelectTrigger
                id="product-availability-filter"
                className="w-48 rounded-xl"
              >
                <SelectValue placeholder={t("allAvailability")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CLEAR_VALUE}>{t("allAvailability")}</SelectItem>
                <SelectItem value="inactive">{t("providerInactive")}</SelectItem>
              </SelectContent>
            </Select>
          </Box>

          <Box className="flex flex-col gap-1.5">
            <Label htmlFor="product-price-filter">{t("price")}</Label>
            {/* Ranges are inferred: the reference only ever shows this select's
                "All Price" trigger, never its open list (§4.6). */}
            <Select
              value={price ?? ""}
              onValueChange={(next) => onPriceChange(next === CLEAR_VALUE ? undefined : next)}
            >
              <SelectTrigger
                id="product-price-filter"
                className="w-48 rounded-xl"
              >
                <SelectValue placeholder={t("allPrice")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CLEAR_VALUE}>{t("allPrice")}</SelectItem>
                {PRICE_RANGE_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                  >
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
        </Box>

        <Box className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl"
            onClick={onRefresh}
          >
            <RefreshCw className="size-4" />
            <Text
              as="span"
              className="sr-only"
            >{t("refresh")}</Text>
          </Button>
          {/* Two ways in, per the reference: one product at a time, or a bulk
              import. The reference's menu reads "Menual" — a misspelling, not
              a term, so it is corrected the same way the lorem-ipsum subcopy
              and the "9999999" footer were. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="rounded-xl">
                <Plus className="size-4" />{t("addMainProducts")}<ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-2xl"
            >
              <DropdownMenuItem onSelect={onAddSingle}>{t("single")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={onAddBulk}>{t("bulk")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Box>
      </Box>

      {/* Selection actions collapse into one "N items selected" menu (the
          reference's checklist menu), only shown with a selection. Edit Logo
          still waits on the product image endpoint (§5). */}
      {selectedCount > 0 && (
        <Box className="flex justify-end">
          <BulkActionsMenu
            count={selectedCount}
            actions={[
              {
                label: t("editLogo"),
                icon: <ImageIcon className="size-4" />,
                onSelect: announceDeferred("Bulk logo upload lands with the product image endpoint"),
              },
              { label: t("uxiolabsUpdate"), icon: <RefreshCcw className="size-4" />, onSelect: onBulkUxiolabs },
              { label: t("showPrice"), icon: <Eye className="size-4" />, onSelect: onBulkShowPrice },
              { label: t("unpublish"), icon: <Archive className="size-4" />, onSelect: onBulkUnpublish },
              { label: t("archive"), icon: <Archive className="size-4" />, onSelect: onBulkArchive },
            ]}
          />
        </Box>
      )}
    </Box>
  );
}
