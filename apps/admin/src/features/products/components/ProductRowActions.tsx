import { useTranslation } from "react-i18next";
import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  MoreVertical,
  Pencil,
  RefreshCcw,
  Rocket,
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
  useDeleteProducts,
  useUxiolabsUpdateProducts,
  useRestoreProduct,
  useSetProductPublished,
} from "../hooks/useProducts";
import type { Product } from "../types/product.type";
import { MainProductFormDialog } from "./MainProductFormDialog";

interface ProductRowActionsProps {
  product: Product;
}

/**
 * Row menu for the Main Products list. Uxiolabs Update goes through a confirm
 * dialog; the lifecycle toggle, Edit and Archive are unchanged. The single-row
 * paths reuse the bulk hooks with a one-id selection.
 *
 * Price visibility ("Hide Price") and the price-limit page are not offered here
 * on purpose: they are pricing edges an admin rarely reaches for, and both sat
 * between the entries that are actually used — so the menu buried "Edit
 * Product" under them. Visibility is still reachable in bulk from the toolbar.
 *
 * There is NO delete here. A product that stops selling is unpublished —
 * "Unlistis" — not removed: order history resolves against `transactions.
 * product_id` (a RESTRICT foreign key), so the row has to outlive its listing.
 * The archive path still exists on the server for operators, and an archived
 * row (reachable through the Archived filter) offers Restore.
 *
 * The lifecycle item reads the row's own state and offers the direction that
 * would change something: a live row is offered "Unpublish", a draft "Publish".
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
  const [publishOpen, setPublishOpen] = useState(false);
  const [uxiolabsOpen, setUxiolabsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const setProductPublished = useSetProductPublished();
  const restoreProduct = useRestoreProduct();
  const uxiolabsUpdate = useUxiolabsUpdateProducts();
  const deleteProducts = useDeleteProducts();

  // Each toggle names what the click would do, not what the row currently is.
  const isArchived = product.publish_state === "archived";
  const nextPublished = product.publish_state !== "published";

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
          {/* An archived product has nothing to publish or edit — the one
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
              {/* Archive, not delete: the row survives for its order history and
                  can be restored. Also the confirmed path for a product whose
                  provider SKU went inactive. */}
              <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
                <Archive />{t("archive")}</DropdownMenuItem>
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

      <DeleteConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        icon={<Archive />}
        confirmLabel={t("archive")}
        title={t("archiveProductTitle")}
        description={t("archiveProductDescription")}
        onConfirm={() => deleteProducts.mutate([product.id])}
      />

      <MainProductFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        productId={product.id}
      />
    </>
  );
}
