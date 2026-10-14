import { useTranslation } from "react-i18next";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { Box } from "@/components/common/Box";
import { DataTable } from "@/components/common/DataTable";
import { Heading } from "@/components/common/Heading";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { poolCandidateColumnsFor } from "../components/poolCandidateColumns";
import { PoolCandidateFilters } from "../components/PoolCandidateFilters";
import { ALL, EMPTY_POOL_FILTERS, type PoolFilterState } from "../lib/poolFilters";
import { usePoolCandidates, usePoolFacets, usePoolSkus } from "../hooks/useProviderPool";
import type { PoolAvailability, PoolCandidate, PoolSort } from "../types/product.type";

const DEFAULT_PAGE_SIZE = 10;
const POOL_PATH = "/admin/products/provider";

/** `"all"` and `""` both mean "do not narrow on this" — send neither. */
const orUndefined = (value: string) => (value === ALL || value === "" ? undefined : value);
const asNumber = (value: string) => (value === "" ? undefined : Number(value));

/**
 * "Add Product Provider" — a page of its own.
 *
 * It briefly lived as a panel inside the pool page, which put two tables on one
 * screen showing overlapping SKU names. That was ambiguous enough that the tests
 * needed an `aria-label` to tell the two apart; a person had no such affordance.
 *
 * It offers only SKUs whose provider category has a Category Provider mapping, so
 * configuring a game is literally what makes its catalogue appear here.
 */
export default function PoolCandidatesPage() {
  const { t } = useTranslation("products");
  const navigate = useNavigate();

  const [filters, setFilters] = useState<PoolFilterState>(EMPTY_POOL_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const poolSkus = usePoolSkus();
  const { data: facets } = usePoolFacets();

  // Only the typed fields are debounced. A select is one deliberate event, and
  // delaying it would just make the page feel slow.
  const search = useDebouncedValue(filters.search);
  const costMin = useDebouncedValue(filters.costMin);
  const costMax = useDebouncedValue(filters.costMax);

  const params = useMemo(
    () => ({
      search: search || undefined,
      provider_category: orUndefined(filters.providerCategory),
      category_id: orUndefined(filters.categoryId),
      pool_state: filters.poolState,
      availability: filters.availability as PoolAvailability,
      cost_min: asNumber(costMin),
      // An inverted range is a typo mid-edit, not a query — the API 422s on it,
      // so drop the ceiling rather than turning a keystroke into an error toast.
      cost_max: asNumber(costMin) !== undefined && asNumber(costMax) !== undefined && Number(costMax) < Number(costMin)
        ? undefined
        : asNumber(costMax),
      sort: orUndefined(filters.sort) as PoolSort | undefined,
      page,
      per_page: pageSize,
    }),
    [search, costMin, costMax, filters, page, pageSize],
  );

  const { data, isLoading, isError, refetch } = usePoolCandidates(params);

  /**
   * Narrowing the list invalidates the page number, so both move together.
   *
   * Page 4 of a filtered set is usually past the end, which renders as "no
   * results" for a filter that in fact matched plenty. Done here rather than in
   * an effect watching the filters: an effect would set state during render and
   * cascade an extra request for the page it was about to leave.
   */
  const changeFilters = useCallback((patch: Partial<PoolFilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  }, []);

  const handleSelectionChange = useCallback((ids: string[]) => setSelectedIds(ids), []);
  // An already-pooled SKU cannot be added again — DataTable renders a lock in
  // place of its checkbox and keeps it out of the selection entirely.
  const canSelectRow = useCallback((row: PoolCandidate) => !row.already_pooled, []);

  const backToPool = () => navigate({ to: POOL_PATH });

  const handleAdd = () => {
    // `usePoolSkus` already invalidates the pool list and the summary badge, so
    // going straight back shows the new rows rather than a stale table.
    poolSkus.mutate(selectedIds, { onSuccess: backToPool });
  };

  return (
    <Box className="flex flex-col gap-6">
      <Box className="rounded-2xl border border-border bg-card p-6">
        <Heading
          level={1}
          variant="section"
        >{t("addProductProvider")}</Heading>
        <Text variant="muted">{t("poolSubtitle")}</Text>
      </Box>

      <Box className="rounded-2xl border border-border bg-card p-4">
        <PoolCandidateFilters
          filters={filters}
          onChange={changeFilters}
          onReset={() => {
            setFilters(EMPTY_POOL_FILTERS);
            setPage(1);
          }}
          onRefresh={() => refetch()}
          facets={facets}
        />

        <Box className="mt-4">
          <DataTable
            columns={poolCandidateColumnsFor(t)}
            data={data?.data ?? []}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => refetch()}
            entityLabel={t("poolEntity")}
            emptyMessage={t("poolEmpty")}
            canSelectRow={canSelectRow}
            onSelectionChange={handleSelectionChange}
            page={page}
            pageSize={pageSize}
            total={data?.meta.total ?? 0}
            lastPage={data?.meta.last_page ?? 1}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </Box>

        <Box className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={backToPool}
          >{t("cancel")}</Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={selectedIds.length === 0 || poolSkus.isPending}
            onClick={handleAdd}
          >
            <Plus className="size-4" />
            {poolSkus.isPending
              ? "Adding..."
              : selectedIds.length > 0
                ? `Add ${selectedIds.length} to pool`
                : "Add to pool"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
