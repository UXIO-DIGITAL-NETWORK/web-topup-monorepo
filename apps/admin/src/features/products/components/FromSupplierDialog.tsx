import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/utils/currency";
import { usePoolCandidates } from "../hooks/useProviderPool";
import { useAddProductsFromSupplier } from "../hooks/useProducts";

interface FromSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const rupiah = (value: number) => formatCurrency(value, { fractionDigits: 0 });

/**
 * Add Products ▸ From Supplier — the pool's replacement.
 *
 * Opening the provider catalogue from the products list, and landing the picks
 * back on that same list as DRAFT rows, is the whole change: the two-step
 * "pool it, then promote it" dance is gone, and so is the second screen that
 * held it. What is picked here is unpublished until someone publishes it.
 *
 * Only SKUs that are not mapped yet are offered — a SKU that already backs a
 * product must not be added twice, and the API enforces that too.
 */
export function FromSupplierDialog({ open, onOpenChange }: FromSupplierDialogProps) {
  const { t } = useTranslation("products");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const params = useMemo(
    () => ({
      search: search || undefined,
      pool_state: "not_pooled",
      availability: "available",
      per_page: 50,
    }),
    [search],
  );

  // Disabled while closed so the dialog costs nothing until it is opened.
  const { data, isLoading } = usePoolCandidates(params, open);
  const addProducts = useAddProductsFromSupplier();

  const rows = data?.data ?? [];

  const toggle = (code: string) =>
    setSelected((current) =>
      current.includes(code) ? current.filter((entry) => entry !== code) : [...current, code],
    );

  const submit = () =>
    addProducts.mutate(selected, {
      onSuccess: () => {
        setSelected([]);
        setSearch("");
        onOpenChange(false);
      },
    });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-3xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t("fromSupplierTitle")}</DialogTitle>
          <DialogDescription>{t("fromSupplierSubtitle")}</DialogDescription>
        </DialogHeader>

        <Box className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-xl pl-8"
            placeholder={t("searchServiceOrSku")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Box>

        <Box className="max-h-80 overflow-y-auto rounded-xl border border-border">
          {isLoading && (
            <Text
              variant="muted"
              className="p-4"
            >
              {t("loading")}
            </Text>
          )}

          {!isLoading && rows.length === 0 && (
            <Text
              variant="muted"
              className="p-4"
            >
              {t("poolEmpty")}
            </Text>
          )}

          {!isLoading &&
            rows.map((row) => {
              const isSelected = selected.includes(row.buyer_sku_code);

              return (
                <Box
                  key={row.id}
                  as="button"
                  type="button"
                  onClick={() => toggle(row.buyer_sku_code)}
                  className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted/50"
                >
                  <Box
                    className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input"
                    }`}
                  >
                    {isSelected && <Check className="size-3" />}
                  </Box>
                  <Box className="flex flex-1 flex-col">
                    <Text
                      as="span"
                      className="font-medium"
                    >
                      {row.name}
                    </Text>
                    <Text
                      as="span"
                      variant="small"
                      className="text-muted-foreground"
                    >
                      {row.buyer_sku_code} · {row.mapped_category_name ?? row.provider_category}
                    </Text>
                  </Box>
                  <Text
                    as="span"
                    variant="small"
                    className="tabular-nums"
                  >
                    {rupiah(row.cost)}
                  </Text>
                </Box>
              );
            })}
        </Box>

        <Box className="flex items-center justify-between">
          <Text variant="muted">{t("selectedForDraft", { count: selected.length })}</Text>
          <Box className="flex items-center gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              className="rounded-xl"
              disabled={selected.length === 0 || addProducts.isPending}
              onClick={submit}
            >
              {t("addSelected")}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
