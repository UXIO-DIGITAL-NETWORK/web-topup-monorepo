import { useTranslation } from "react-i18next";
import { useCallback, useMemo, useState } from "react";
import { Archive, Eye, RefreshCcw } from "lucide-react";

import { Box } from "@/components/common/Box";
import { DataTable } from "@/components/common/DataTable";
import { DeleteConfirmDialog } from "@/components/common/DeleteConfirmDialog";
import { Heading } from "@/components/common/Heading";
import { Text } from "@/components/common/Text";
import { mainProductColumnsFor } from "../components/mainProductColumns";
import { FromSupplierDialog } from "../components/FromSupplierDialog";
import { MainProductFormDialog } from "../components/MainProductFormDialog";
import { MainProductToolbar } from "../components/MainProductToolbar";
import {
  useUxiolabsUpdateProducts,
  useProductList,
  useSetProductPublished,
  useShowProducts,
} from "../hooks/useProducts";
import type { ProductListParams } from "../types/product.type";

const DEFAULT_PAGE_SIZE = 10;

/**
 * Main Products list (product_requirements.md §4.6) — the first of the two
 * Product tabs, and the only one with a reference frame.
 *
 * Two corrections to that reference, both the same defect classes confirmed
 * across five Category references: the header subcopy is real copy rather than
 * "lorem ipsum dolor sit amet", and the footer counts products rather than the
 * copy-pasted "9999999 transactions".
 */
export default function MainProductsPage() {
  const { t } = useTranslation("products");
  const [search, setSearch] = useState("");
  // A real category id now, not its name — see products.service `list()`.
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [price, setPrice] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [publishState, setPublishState] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkUnpublishOpen, setBulkUnpublishOpen] = useState(false);
  const [bulkShowOpen, setBulkShowOpen] = useState(false);
  const [bulkUxiolabsOpen, setBulkUxiolabsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [fromSupplierOpen, setFromSupplierOpen] = useState(false);

  const params = useMemo(
    () => ({
      search: search || undefined,
      category_id: categoryId,
      price,
      publish_state: publishState as ProductListParams["publish_state"],
      page,
      per_page: pageSize,
    }),
    [search, categoryId, price, publishState, page, pageSize],
  );
  const { data, isLoading, isError, refetch } = useProductList(params);
  const setProductPublished = useSetProductPublished();
  const showProducts = useShowProducts();
  const uxiolabsUpdate = useUxiolabsUpdateProducts();

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleCategoryChange = (value: string | undefined) => {
    setCategoryId(value);
    setPage(1);
  };

  const handlePriceChange = (value: string | undefined) => {
    setPrice(value);
    setPage(1);
  };

  // Stable identity: DataTable reports selection from an effect, so an inline
  // arrow here would re-run it on every render.
  const handleSelectionChange = useCallback((ids: string[]) => setSelectedIds(ids), []);

  return (
    <Box className="flex flex-col gap-6">
      <Box className="rounded-2xl border border-border bg-card p-6">
        <Heading
          level={1}
          variant="section"
        >{t("tabMainProducts")}</Heading>
        <Text variant="muted">{t("mainProductsSubtitle")}</Text>
      </Box>

      <Box className="rounded-2xl border border-border bg-card p-4">
        <MainProductToolbar
          search={search}
          onSearchChange={handleSearchChange}
          category={categoryId}
          onCategoryChange={handleCategoryChange}
          price={price}
          onPriceChange={handlePriceChange}
          onRefresh={() => refetch()}
          onAdd={() => setAddOpen(true)}
          selectedCount={selectedIds.length}
          onBulkUxiolabs={() => setBulkUxiolabsOpen(true)}
          onBulkShowPrice={() => setBulkShowOpen(true)}
          publishState={publishState}
          onPublishStateChange={(next) => {
            setPublishState(next);
            setPage(1);
          }}
          onBulkUnpublish={() => setBulkUnpublishOpen(true)}
          onAddFromSupplier={() => setFromSupplierOpen(true)}
        />
      </Box>

      <Box className="rounded-2xl border border-border bg-card p-4">
        <DataTable
          columns={mainProductColumnsFor(t)}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          entityLabel={t("productsEntity")}
          showRowNumber
          formatPageSizeLabel={(size) => `${size} Row`}
          onSelectionChange={handleSelectionChange}
          page={data?.meta.current_page ?? page}
          pageSize={data?.meta.per_page ?? pageSize}
          total={data?.meta.total ?? 0}
          lastPage={data?.meta.last_page ?? 1}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Box>

      {/* Unpublishing is reversible, so the copy says what changes rather than
          warning it cannot be undone — but it still takes products off sale, so
          it goes through the same confirmation (`.claude/rules/rbac-security.md`).

          Unpublish-only on purpose, unlike the row menu's toggle: a selection can
          hold rows in any state, so there is no single one to invert. */}
      <DeleteConfirmDialog
        open={bulkUnpublishOpen}
        onOpenChange={setBulkUnpublishOpen}
        icon={<Archive />}
        confirmLabel={t("unpublish")}
        title={selectedIds.length <= 1 ? "Unpublish this product?" : `Unpublish ${selectedIds.length} products?`}
        description={
          selectedIds.length <= 1
            ? "It leaves the storefront and stops being orderable. You can publish it again at any time."
            : `These ${selectedIds.length} products leave the storefront and stop being orderable. You can publish them again at any time.`
        }
        onConfirm={() => setProductPublished.mutate({ ids: selectedIds, published: false })}
      />

      <DeleteConfirmDialog
        open={bulkUxiolabsOpen}
        onOpenChange={setBulkUxiolabsOpen}
        icon={<RefreshCcw />}
        confirmLabel={t("update")}
        title={selectedIds.length <= 1 ? "Update this product?" : `Update ${selectedIds.length} products?`}
        description={t("bulkUpdateDescription")}
        onConfirm={() => uxiolabsUpdate.mutate(selectedIds)}
      />

      <DeleteConfirmDialog
        open={bulkShowOpen}
        onOpenChange={setBulkShowOpen}
        icon={<Eye />}
        confirmLabel={t("show")}
        title={selectedIds.length <= 1 ? "Show this price?" : `Show ${selectedIds.length} prices?`}
        description={t("bulkShowDescription")}
        onConfirm={() => showProducts.mutate({ ids: selectedIds, hidden: false })}
      />

      <MainProductFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {/* Add Products ▸ From Supplier. Its own dialog rather than a route: the
          point of removing the pool is that adding lands you back on this list. */}
      <FromSupplierDialog
        open={fromSupplierOpen}
        onOpenChange={setFromSupplierOpen}
      />
    </Box>
  );
}
