import { useTranslation } from "react-i18next";
import { RefreshCw, Search, X } from "lucide-react";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { digitsOnly } from "@/lib/numericInput";
import { formatCurrency } from "@/utils/currency";
import { ALL, countActiveFilters, type PoolFilterState } from "../lib/poolFilters";
import type { PoolFacets, PoolSort } from "../types/product.type";

const SORT_LABELS: Record<PoolSort, string> = {
  name_asc: "Name A–Z",
  name_desc: "Name Z–A",
  cost_asc: "Cost, low to high",
  cost_desc: "Cost, high to low",
};

interface PoolCandidateFiltersProps {
  filters: PoolFilterState;
  onChange: (patch: Partial<PoolFilterState>) => void;
  onReset: () => void;
  onRefresh: () => void;
  facets?: PoolFacets;
}

/**
 * The filter bar for Add Product Provider.
 *
 * This page shows a provider's whole catalogue for every configured game —
 * thousands of rows spanning three orders of magnitude in cost. Search alone
 * cannot express "the Free Fire denominations under twenty thousand", which is
 * the shape of question an admin building a catalogue actually asks.
 *
 * Two categories, not one, because they are different questions: the provider's
 * own `kategori` string is what the upstream feed is organised by, while our
 * category is what an admin thinks in — and several provider categories can map
 * onto one of ours.
 *
 * The cost bounds are free numbers rather than fixed bands: a band list that
 * fits Mobile Legends diamonds (Rp 1.500 – Rp 1.3M) fits nothing else, and the
 * range hint below the inputs shows the real bounds so the numbers are not a
 * guess.
 */
export function PoolCandidateFilters({ filters, onChange, onReset, onRefresh, facets }: PoolCandidateFiltersProps) {
  const { t } = useTranslation("products");
  const activeCount = countActiveFilters(filters);
  const costRange = facets?.cost;

  return (
    <Box className="flex flex-col gap-3">
      <Box className="flex flex-wrap items-end gap-3">
        <Box className="flex flex-col gap-1.5">
          <Label htmlFor="pool-search">{t("search")}</Label>
          <Box className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="pool-search"
              value={filters.search}
              onChange={(event) => onChange({ search: event.target.value })}
              placeholder={t("searchServiceOrSku")}
              aria-label={t("searchProviderServices")}
              className="h-9 w-full rounded-xl pl-8 sm:w-56"
            />
          </Box>
        </Box>

        <Box className="flex flex-col gap-1.5">
          <Label htmlFor="pool-provider-category">{t("providerCategory")}</Label>
          <Select
            value={filters.providerCategory}
            onValueChange={(value) => onChange({ providerCategory: value })}
          >
            <SelectTrigger
              id="pool-provider-category"
              aria-label={t("filterByProviderCategory")}
              className="h-9 w-56 rounded-xl"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allProviderCategories")}</SelectItem>
              {facets?.provider_categories.map((option) => (
                <SelectItem
                  key={option.provider_category}
                  value={option.provider_category}
                >
                  {option.provider_category} ({option.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Box>

        <Box className="flex flex-col gap-1.5">
          <Label htmlFor="pool-category">{t("ourCategory")}</Label>
          <Select
            value={filters.categoryId}
            onValueChange={(value) => onChange({ categoryId: value })}
          >
            <SelectTrigger
              id="pool-category"
              aria-label={t("filterByMappedCategory")}
              className="h-9 w-48 rounded-xl"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allCategories")}</SelectItem>
              {facets?.categories.map((option) => (
                <SelectItem
                  key={option.id}
                  value={String(option.id)}
                >
                  {option.name ?? "—"} ({option.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Box>

        <Box className="flex flex-col gap-1.5">
          <Label htmlFor="pool-cost-min">{t("cost")}</Label>
          <Box className="flex items-center gap-2">
            <Input
              id="pool-cost-min"
              inputMode="numeric"
              value={filters.costMin}
              onChange={(event) => onChange({ costMin: digitsOnly(event.target.value) })}
              placeholder={t("min")}
              aria-label={t("minimumCost")}
              className="h-9 w-28 rounded-xl tabular-nums"
            />
            <Text
              as="span"
              variant="small"
              className="text-muted-foreground"
            >
              –
            </Text>
            <Input
              id="pool-cost-max"
              inputMode="numeric"
              value={filters.costMax}
              onChange={(event) => onChange({ costMax: digitsOnly(event.target.value) })}
              placeholder={t("max")}
              aria-label={t("maximumCost")}
              className="h-9 w-28 rounded-xl tabular-nums"
            />
          </Box>
        </Box>

        <Box className="flex flex-col gap-1.5">
          <Label htmlFor="pool-state">{t("poolState")}</Label>
          <Select
            value={filters.poolState}
            onValueChange={(value) => onChange({ poolState: value })}
          >
            <SelectTrigger
              id="pool-state"
              aria-label={t("filterByPoolState")}
              className="h-9 w-40 rounded-xl"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">{t("newOnly")}</SelectItem>
              <SelectItem value="not_pooled">{t("notPooled")}</SelectItem>
              <SelectItem value={ALL}>{t("all")}</SelectItem>
            </SelectContent>
          </Select>
        </Box>

        <Box className="flex flex-col gap-1.5">
          <Label htmlFor="pool-availability">{t("availability")}</Label>
          <Select
            value={filters.availability}
            onValueChange={(value) => onChange({ availability: value })}
          >
            <SelectTrigger
              id="pool-availability"
              aria-label={t("filterByAvailability")}
              className="h-9 w-40 rounded-xl"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">{t("availableOnly")}</SelectItem>
              <SelectItem value="unavailable">{t("unavailable")}</SelectItem>
              <SelectItem value={ALL}>{t("all")}</SelectItem>
            </SelectContent>
          </Select>
        </Box>

        <Box className="flex flex-col gap-1.5">
          <Label htmlFor="pool-sort">{t("sort")}</Label>
          <Select
            value={filters.sort}
            onValueChange={(value) => onChange({ sort: value })}
          >
            <SelectTrigger
              id="pool-sort"
              aria-label={t("sortServices")}
              className="h-9 w-44 rounded-xl"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* The provider's own order groups a game's denominations
                  together, which is often what someone adding a catalogue
                  wants — so it stays the default rather than being replaced. */}
              <SelectItem value={ALL}>{t("providerOrder")}</SelectItem>
              {(Object.keys(SORT_LABELS) as PoolSort[]).map((value) => (
                <SelectItem
                  key={value}
                  value={value}
                >
                  {SORT_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Box>

        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("refreshCandidates")}
          className="h-9 rounded-xl"
          onClick={onRefresh}
        >
          <RefreshCw className="size-4" />
        </Button>
      </Box>

      <Box className="flex flex-wrap items-center gap-3">
        {costRange && costRange.max > 0 && (
          <Text
            as="span"
            variant="small"
            className="text-muted-foreground tabular-nums"
          >
            Costs run {formatCurrency(costRange.min)} – {formatCurrency(costRange.max)}
          </Text>
        )}

        {activeCount > 0 && (
          <>
            <Badge variant="secondary">
              {activeCount} filter{activeCount > 1 ? "s" : ""} active
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 rounded-xl"
              onClick={onReset}
            >
              <X className="size-3.5" />{t("resetFilters")}</Button>
          </>
        )}
      </Box>
    </Box>
  );
}
