import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { productsService, type ProductInput } from "../services/products.service";
import type {
  AddProductsFromSupplierItem,
  BulkCreateProductsInput,
  Product,
  ProductListParams,
  SetProductMarginInput,
} from "../types/product.type";

/**
 * A product's lifecycle lives in two tables: publishing flips the product AND
 * its supplier mapping. Invalidating only `["products"]` left the pool's badges
 * describing a state that no longer existed.
 */
const invalidateProductAndPool = (queryClient: ReturnType<typeof useQueryClient>) => {
  for (const queryKey of [["products"], ["supplier-products"], ["uxiolabs", "pool-candidates"]]) {
    queryClient.invalidateQueries({ queryKey });
  }
};

/** The API's own refusal reason beats a generic failure message. */
const apiErrorMessage = (error: unknown): string | undefined =>
  isAxiosError(error) ? (error.response?.data as { message?: string } | undefined)?.message : undefined;

export const useProductList = (params: ProductListParams) =>
  useQuery({
    queryKey: ["products", "list", params],
    queryFn: () => productsService.list(params),
  });

export const useProduct = (id?: string) =>
  useQuery({
    queryKey: ["products", "detail", id],
    queryFn: () => productsService.getById(id as string),
    enabled: Boolean(id),
  });

/** Suppliers for the Add Product Bulk picker. */
export const useSuppliers = () =>
  useQuery({ queryKey: ["suppliers", "options"], queryFn: () => productsService.suppliers() });

/** Add Product (Bulk) — create many at once; the toast reports created/skipped. */
export const useBulkCreateProducts = () => {
  const { t } = useTranslation("products");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BulkCreateProductsInput) => productsService.bulkCreate(input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-products"] });
      queryClient.invalidateQueries({ queryKey: ["uxiolabs", "price-list"] });
      toast.success(
        result.skipped.length === 0
          ? `${result.created} products added`
          : `${result.created} added, ${result.skipped.length} skipped`,
      );
    },
    onError: () => toast.error(t("addProductsFailed")),
  });
};

/**
 * Add Products — create and configure in one call.
 *
 * The batch is per-row resilient, so a partial success is the normal outcome and
 * the toast says what was skipped. Both lists are invalidated: the products list
 * gains rows and the provider candidates change state.
 */
export const useAddProductsFromSupplier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { items: AddProductsFromSupplierItem[]; publish: boolean }) =>
      productsService.addFromSupplier(input),
    onSuccess: (result, { publish }) => {
      invalidateProductAndPool(queryClient);

      const skipped = result.skipped.length;
      const verb = publish ? "published" : "saved as draft";

      if (skipped > 0) {
        toast.warning(`${result.created} ${verb}, ${skipped} skipped`, {
          description: result.skipped[0]?.reason,
        });
        return;
      }

      toast.success(result.created === 1 ? `Product ${verb}` : `${result.created} products ${verb}`);
    },
    onError: () => toast.error("Failed to add products from supplier"),
  });
};

/** Add Main Products (§4.6). Same shape as `useCreateCategory`. */
export const useCreateProduct = () => {
  const { t } = useTranslation("products");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<Product, "id" | "created_at" | "updated_at">) => productsService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(t("productCreated"));
    },
    onError: () => {
      toast.error(t("productCreateFailed"));
    },
  });
};

/** The selection bar's "Deactive (N)" — same bulk shape as the delete path. */
export const useUpdateProduct = () => {
  const { t } = useTranslation("products");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ProductInput> }) => productsService.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(t("productUpdated"));
    },
    onError: () => {
      toast.error(t("productUpdateFailed"));
    },
  });
};

/**
 * Publish or unpublish — the row menu passes `[id]` with the direction its label
 * promised, the bulk menu passes the selection.
 *
 * The server skips per row rather than failing the batch, so a partial result is
 * a warning with the first reason attached, not an error. Same contract, and the
 * same toast shape, as the pool's bulk publish.
 */
export const useSetProductPublished = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, published }: { ids: string[]; published: boolean }) =>
      productsService.bulkSetPublished(ids, published),
    onSuccess: (result, { published }) => {
      invalidateProductAndPool(queryClient);
      const verb = published ? "published" : "unpublished";
      const skipped = result.skipped.length;

      if (skipped > 0) {
        toast.warning(`${result.updated} ${verb}, ${skipped} skipped`, {
          description: result.skipped[0]?.reason,
        });
        return;
      }

      toast.success(result.updated === 1 ? `Product ${verb}` : `${result.updated} products ${verb}`);
    },
    onError: (_error, { ids, published }) => {
      const verb = published ? "publish" : "unpublish";
      toast.error(ids.length === 1 ? `Failed to ${verb} product` : `Failed to ${verb} products`);
    },
  });
};

/** Bring an archived product back — it returns unpublished, never straight live. */
export const useRestoreProduct = () => {
  const { t } = useTranslation("products");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => productsService.restore(id),
    onSuccess: () => {
      invalidateProductAndPool(queryClient);
      toast.success(t("productRestored"));
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error) ?? t("restoreFailed"));
    },
  });
};

/**
 * Archive, not delete. The row survives so its order history keeps resolving —
 * `transactions.product_id` is RESTRICT, and a real delete used to 500.
 */
export const useDeleteProducts = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => productsService.bulkDelete(ids),
    onSuccess: (_result, ids) => {
      invalidateProductAndPool(queryClient);
      toast.success(ids.length === 1 ? "Product archived" : `${ids.length} products archived`);
    },
    onError: (_error, ids) => {
      toast.error(ids.length === 1 ? "Failed to archive product" : "Failed to archive products");
    },
  });
};

/** Show/hide the price on the storefront (row `[id]` or bulk). */
export const useShowProducts = () => {
  const { t } = useTranslation("products");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, hidden }: { ids: string[]; hidden: boolean }) => productsService.bulkShowPrice(ids, hidden),
    onSuccess: (_result, { ids, hidden }) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`${ids.length === 1 ? "Price" : `${ids.length} prices`} ${hidden ? "hidden" : "shown"}`);
    },
    onError: () => toast.error(t("priceVisibilityFailed")),
  });
};

/** Re-pull selling prices from the supplier cost (row `[id]` or bulk). */
export const useUxiolabsUpdateProducts = () => {
  const { t } = useTranslation("products");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => productsService.bulkUxiolabsUpdate(ids),
    onSuccess: (_result, ids) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(ids.length === 1 ? "Product updated from supplier" : `${ids.length} products updated from supplier`);
    },
    onError: () => toast.error(t("supplierUpdateFailed")),
  });
};

/**
 * Save a product's mix.
 *
 * The server owns the arithmetic: it accumulates the components' costs into the
 * product's cost and re-derives the sell prices, so the caller only sends the
 * composition. Both the products list and the provider list are invalidated —
 * the accumulated cost is visible in both.
 */
export const useSetProductMix = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: { product_id: string; quantity: string }[] }) =>
      productsService.setMix(id, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error) ?? "Failed to update the product mix"),
  });
};

/** Re-price one product from the Main Products form. */
export const useSetProductMargin = () => {
  const { t } = useTranslation("products");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetProductMarginInput }) => productsService.setMargin(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      // The margins live on the provider mapping, so that list is stale too.
      queryClient.invalidateQueries({ queryKey: ["supplier-products"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error) ?? t("marginUpdateFailed")),
  });
};

/** Set a single product's min/max price window. */
export const useSetProductPriceLimit = () => {
  const { t } = useTranslation("products");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, limits }: { id: string; limits: { price_min: number | null; price_max: number | null } }) =>
      productsService.setPriceLimit(id, limits),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(t("priceLimitUpdated"));
    },
    onError: () => toast.error(t("priceLimitFailed")),
  });
};
