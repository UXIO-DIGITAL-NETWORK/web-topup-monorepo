import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Box } from "@/components/common/Box";
import { Heading } from "@/components/common/Heading";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { digitsOnly } from "@/lib/numericInput";
import { ProductPriceCell } from "../components/ProductPriceCell";
import { useProduct, useSetProductPriceLimit } from "../hooks/useProducts";
import type { Product } from "../types/product.type";

/**
 * Set Price Limit — a lower/upper window for a product's selling prices
 * (`0 = no limit`). Saving clamps the stored tier prices into the window. The
 * product rides in `?id=` so the page is linkable and refresh-safe.
 */
export default function MainProductPriceLimitPage({ id }: { id: string }) {
  const { t } = useTranslation("products");
  const { data: product } = useProduct(id || undefined);

  return (
    <Box className="flex flex-col gap-6">
      <Box className="rounded-2xl border border-border bg-card p-6">
        <Heading level={1} variant="section">{t("setPriceLimitTitle")}</Heading>
        <Text variant="muted">{t("setPriceLimitSubtitle")}</Text>
      </Box>

      {product ? (
        // Keyed so the form's initial state seeds from the resolved product
        // without a state-syncing effect.
        <PriceLimitForm key={product.id} id={id} product={product} />
      ) : (
        <Box className="rounded-2xl border border-border bg-card p-6">
          <Text variant="muted">{t("loadingProduct")}</Text>
        </Box>
      )}
    </Box>
  );
}

function PriceLimitForm({ id, product }: { id: string; product: Product }) {
  const { t } = useTranslation("products");
  const navigate = useNavigate();
  const setLimit = useSetProductPriceLimit();
  const [min, setMin] = useState(product.price_min ? String(product.price_min) : "");
  const [max, setMax] = useState(product.price_max ? String(product.price_max) : "");

  const parse = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  const backToList = () => navigate({ to: "/admin/products/main" });

  const onSubmit = () =>
    setLimit.mutate(
      { id, limits: { price_min: parse(min), price_max: parse(max) } },
      { onSuccess: backToList },
    );

  return (
    <Box className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Box className="rounded-2xl border border-border bg-card p-4">
        <Text as="span" variant="muted">
          {product.category_name} · {product.code}
        </Text>
        <Text as="span" className="font-medium">
          {product.name}
        </Text>
        <Box className="mt-3">
          <ProductPriceCell variants={product.variants} />
        </Box>
      </Box>

      <Box className="h-fit rounded-2xl border border-border bg-card p-6">
        <Box className="flex flex-col gap-4">
          <Box className="flex flex-col gap-1.5">
            <Label htmlFor="price-min">{t("lowerLimit")}</Label>
            <Input
              id="price-min"
              inputMode="numeric"
              value={min}
              onChange={(e) => setMin(digitsOnly(e.target.value))}
              placeholder="0"
            />
            <Text variant="small">0 = no limit</Text>
          </Box>
          <Box className="flex flex-col gap-1.5">
            <Label htmlFor="price-max">{t("upperLimit")}</Label>
            <Input
              id="price-max"
              inputMode="numeric"
              value={max}
              onChange={(e) => setMax(digitsOnly(e.target.value))}
              placeholder="0"
            />
            <Text variant="small">0 = no limit</Text>
          </Box>
        </Box>
        <Box className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={backToList}>{t("cancel")}</Button>
          <Button type="button" onClick={onSubmit} disabled={setLimit.isPending || !id}>
            {setLimit.isPending ? "Saving…" : "Save"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
