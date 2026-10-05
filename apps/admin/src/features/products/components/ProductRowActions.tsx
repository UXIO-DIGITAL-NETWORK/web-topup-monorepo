import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  Eye,
  EyeOff,
  MoreVertical,
  Pencil,
  RefreshCcw,
  Rocket,
  SlidersHorizontal,
} from "lucide-react";

import { Box } from "@/components/common/Box";
import { Can } from "@/components/common/Can";
import { Text } from "@/components/common/Text";
import { DeleteConfirmDialog } from "@/components/common/DeleteConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useUxiolabsUpdateProducts,
  useRestoreProduct,
  useSetProductPublished,
  useShowProducts,
} from "../hooks/useProducts";
import type { Product } from "../types/product.type";
import { MainProductFormDialog } from "./MainProductFormDialog";

interface ProductRowActionsProps {
  product: Product;
}

/**
 * Row menu for the Main Products list, in the reference's order. Each action is
 * wired: Uxiolabs Update / Show Price go through a confirm dialog, Set Price
 * Limit opens its page, and the lifecycle toggle / Edit are unchanged. The
 * single-row paths reuse the bulk hooks with a one-id selection.
 *
 * There is NO delete here. A product that stops selling is unpublished —
 * "Unlistis" — not removed: order history resolves against `transactions.
 * product_id` (a RESTRICT foreign key), so the row has to outlive its listing.
 * The archive path still exists on the server for operators, and an archived
 * row (reachable through the Archived filter) offers Restore.
 *
 * The two reversible items — publishing and price visibility — each read the
 * row's own state and offer the direction that would change something. A live
 * row is offered "Unpublish"; a hidden one, "Show Price".
 *
 * A price lock used to sit between them, holding the selling price still while
 * the supplier's cost moved underneath it. That is what left a product priced
 * below its cost and made checkout refuse the customer, so it is gone: prices
 * follow the margin rules, always.
 *
 * Publish replaced Activate. Activate wrote the product's `status` and nothing
 * else, while a product is only sellable when an active supplier mapping backs
 * it too — so it could report a product as live that the storefront could not
 * see, and there was no second verb on this screen to finish the job. One verb
 * moves both halves now, and `can_publish` carries the server's own reason when
 * it cannot.
 *
 * An archived row is a different thing entirely: nothing about it can be edited,
 * so the menu collapses to Restore.
 */
export function ProductRowActions({ product }: ProductRowActionsProps) {
  const { t } = useTranslation("products");
  const navigate = useNavigate();
  const [publishOpen, setPublishOpen] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [uxiolabsOpen, setUxiolabsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const setProductPublished = useSetProductPublished();
  const restoreProduct = useRestoreProduct();
  const showProducts = useShowProducts();
  const uxiolabsUpdate = useUxiolabsUpdateProducts();

  // Each toggle names what the click would do, not what the row currently is.
  const isArchived = product.publish_state === "archived";
  const nextPublished = product.publish_state !== "published";
  const nextHidden = !product.is_price_hidden;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="rounded-xl"
            size="icon-sm"
            aria-label={`Actions for ${product.name}`}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="rounded-2xl"
        >
          {/* An archived product has nothing to price, publish or edit — the one
              thing that applies to it is bringing it back. */}
          {isArchived ? (
            <Can permission="products.edit">
              <DropdownMenuItem onSelect={() => restoreProduct.mutate(product.id)}>
                <ArchiveRestore />{t("restore")}</DropdownMenuItem>
            </Can>
          ) : (
            <Can permission="products.edit">
              <DropdownMenuItem onSelect={() => setUxiolabsOpen(true)}>
                <RefreshCcw />{t("uxiolabsUpdate")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShowOpen(true)}>
                {nextHidden ? <EyeOff /> : <Eye />}
                {nextHidden ? "Hide Price" : "Show Price"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => navigate({ to: "/admin/products/main/set-price-limit", search: { id: product.id } })}
              >
                <SlidersHorizontal />{t("setPriceLimit")}</DropdownMenuItem>
              {/* Disabled rather than hidden, with the server's own reason inside
                the item: a disabled DropdownMenuItem swallows pointer events, so
                a tooltip on it would never fire. Same pattern as the pool's
                Promote. */}
              <DropdownMenuItem
                disabled={nextPublished && !product.can_publish}
                onSelect={() => setPublishOpen(true)}
              >
                {nextPublished ? <Rocket /> : <Archive />}
                <Box className="flex flex-col items-start">
                  {nextPublished ? "Publish" : "Unpublish"}
                  {nextPublished && product.publish_blocked_reason && (
                    <Text
                      as="span"
                      variant="small"
                      className="text-muted-foreground"
                    >
                      {product.publish_blocked_reason}
                    </Text>
                  )}
                </Box>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil />{t("editProduct")}</DropdownMenuItem>
            </Can>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteConfirmDialog
        open={uxiolabsOpen}
        onOpenChange={setUxiolabsOpen}
        icon={<RefreshCcw />}
        confirmLabel={t("update")}
        title={t("updateProductTitle")}
        description={t("updateProductDescription")}
        onConfirm={() => uxiolabsUpdate.mutate([product.id])}
      />

      <DeleteConfirmDialog
        open={showOpen}
        onOpenChange={setShowOpen}
        icon={nextHidden ? <EyeOff /> : <Eye />}
        confirmLabel={nextHidden ? "Hide" : "Show"}
        title={nextHidden ? "Hide price for this product?" : "Show price for this product?"}
        description={
          nextHidden
            ? "The price will be hidden on the storefront. The product itself stays listed."
            : "The price will be visible on the storefront."
        }
        onConfirm={() => showProducts.mutate({ ids: [product.id], hidden: nextHidden })}
      />

      {/* Same shared dialog and same mutation as the toolbar's bulk archive —
          only the set of ids differs. The copy no longer claims the action
          cannot be undone, because it can: the row is kept so its order history
          keeps resolving, and Restore brings it back. */}
      <DeleteConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        icon={nextPublished ? <Rocket /> : <Archive />}
        confirmLabel={nextPublished ? "Publish" : "Unpublish"}
        title={nextPublished ? "Publish this product?" : "Unpublish this product?"}
        description={
          nextPublished
            ? "It goes on sale on the storefront, served by its active supplier. Its price visibility is left as it was."
            : "It leaves the storefront and stops being orderable. Nothing else changes, and you can publish it again at any time."
        }
        onConfirm={() => setProductPublished.mutate({ ids: [product.id], published: nextPublished })}
      />

      <MainProductFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        productId={product.id}
      />
    </>
  );
}
