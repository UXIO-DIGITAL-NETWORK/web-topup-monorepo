import type { TFunction } from "i18next";
import type { ColumnDef } from "@tanstack/react-table";

import { Box } from "@/components/common/Box";
import { InfoTooltip } from "@/components/common/FieldLabel";
import { Text } from "@/components/common/Text";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCurrency } from "@/utils/currency";
import { formatDateTime } from "@/utils/date";
import { initials } from "@/utils/initials";
import type { Product } from "../types/product.type";
import { PlanPriceCard } from "./PlanPriceCard";
import { ProductPriceCell } from "./ProductPriceCell";
import { ProductAvailabilityBadge, ProductStatusBadge } from "./ProductStatusBadge";
import { ProductRowActions } from "./ProductRowActions";

/**
 * Columns for the Main Products list (product_requirements.md §4.6). The
 * `No.` column and the select checkbox are injected by the shared `DataTable`,
 * not declared here.
 *
 * `Price` holds the per-variant cost/tier breakdown (`ProductPriceCell`) —
 * the game name it used to show is still searchable but no longer a column.
 */
/**
 * A factory, not a module constant: headers are rendered text, so they
 * have to resolve when the component renders.
 */
export const mainProductColumnsFor = (t: TFunction<"products">): ColumnDef<Product>[] => [
  {
    id: "product",
    header: t("product"),
    cell: ({ row }) => {
      const product = row.original;
      return (
        <Box className="flex items-center gap-3">
          {/* No product art ships with this repo, so every fixture falls back
              to an initials tile — squared off, since a circular avatar reads
              as a person rather than an item. */}
          <Avatar className="size-10 rounded-md">
            <AvatarImage
              src={product.image_url}
              alt={product.name}
              className="rounded-md"
            />
            <AvatarFallback className="rounded-md text-xs">{initials(product.name)}</AvatarFallback>
          </Avatar>
          <Box className="flex flex-col">
            <Text
              as="span"
              className="font-medium"
            >
              {product.name}
            </Text>
            <Text
              variant="muted"
              as="span"
            >
              {product.category_name}
            </Text>
            <Text
              variant="muted"
              as="span"
              className="tabular-nums"
            >
              {product.code}
            </Text>
          </Box>
        </Box>
      );
    },
  },
  {
    id: "variant",
    header: t("colVariant"),
    cell: ({ row }) => (
      <Box className="flex flex-col gap-1">
        {row.original.variants.map((variant) => (
          <Box
            key={variant.id}
            className="flex flex-col"
          >
            <Text as="span">{variant.name}</Text>
            <Box className="flex items-center gap-2">
              <Text
                as="span"
                className="text-muted-foreground tabular-nums"
              >
                {formatCurrency(variant.prices.public, { fractionDigits: 0 })}
              </Text>
              {/* An API product row IS its denomination, so the variant's
                  lifecycle is the product's — there is nothing else it could be. */}
              <ProductStatusBadge state={row.original.publish_state} />
            </Box>
          </Box>
        ))}
      </Box>
    ),
  },
  {
    id: "price",
    header: t("price"),
    // Priced per membership plan, which is how pricing actually works now; a
    // product with no plan rows yet (priced before that cutover) still renders
    // the four legacy tiers rather than an empty cell.
    cell: ({ row }) =>
      (row.original.plan_prices?.length ?? 0) > 0 ? (
        <PlanPriceCard
          cost={row.original.variants[0]?.cost_price ?? 0}
          plans={row.original.plan_prices ?? []}
        />
      ) : (
        <ProductPriceCell variants={row.original.variants} />
      ),
  },
  {
    accessorKey: "created_at",
    header: t("createdAt"),
    cell: ({ row }) => (
      <Text
        as="span"
        className="tabular-nums"
      >
        {formatDateTime(row.original.created_at)}
      </Text>
    ),
  },
  {
    id: "status",
    header: t("status"),
    cell: ({ row }) => (
      <Box className="flex max-w-56 flex-col items-start gap-1">
        <ProductStatusBadge state={row.original.publish_state} />
        <Box className="flex items-center gap-1.5">
          <ProductAvailabilityBadge isAvailable={row.original.is_available} />
          {/* Availability is the provider's own flag: when a SKU is switched off
              upstream the product cannot be sold, so say why rather than leaving
              the admin to guess from a bare "Unavailable". */}
          {!row.original.is_available && <InfoTooltip content={t("providerInactiveHint")} />}
        </Box>
        {!row.original.is_available && (
          <Text
            as="span"
            variant="small"
            className="text-muted-foreground"
          >
            {t("providerInactive")}
          </Text>
        )}
      </Box>
    ),
  },
  {
    id: "action",
    header: t("action"),
    cell: ({ row }) => <ProductRowActions product={row.original} />,
  },
];
