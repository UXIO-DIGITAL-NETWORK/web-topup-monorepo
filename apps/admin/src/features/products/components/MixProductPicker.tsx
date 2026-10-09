import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/currency";

const rupiah = (value: number) => formatCurrency(value, { fractionDigits: 0 });

/** One product that can be part of a mix, with its cost for the simulation. */
export interface MixProductOption {
  id: string;
  name: string;
  code: string;
  cost: number;
}

interface MixProductPickerProps {
  id: string;
  value: string;
  options: MixProductOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Accessible name for the trigger — several pickers can share a page. */
  ariaLabel?: string;
  /** Shown in place of the list when `options` is empty. */
  emptyLabel?: string;
}

/**
 * A searchable picker for a mix component.
 *
 * The list is the main products this site already sells — a mix component must
 * be a real product (`product_mix_items.component_product_id → products`), so a
 * provider SKU cannot be one. Each entry carries its cost, so an admin can see
 * what a component adds to the bundle's modal before adding it.
 */
export function MixProductPicker({ id, value, options, onChange, disabled, ariaLabel, emptyLabel }: MixProductPickerProps) {
  const { t } = useTranslation("products");
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between rounded-xl font-normal"
        >
          <Text
            as="span"
            className={cn("truncate", !selected && "text-muted-foreground")}
          >
            {selected ? `${selected.name} — ${selected.code}` : t("mixSearchPlaceholder")}
          </Text>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <Command>
          <CommandInput placeholder={t("mixSearchPlaceholder")} />
          <CommandList>
            <CommandEmpty>{emptyLabel ?? t("mixNoResults")}</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.id}
                value={`${option.name} ${option.code}`}
                onSelect={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", value === option.id ? "opacity-100" : "opacity-0")} />
                <Box className="flex flex-1 flex-col">
                  <Text
                    as="span"
                    variant="small"
                  >
                    {option.name} — {option.code}
                  </Text>
                  <Text
                    as="span"
                    variant="small"
                    className="text-muted-foreground"
                  >
                    {rupiah(option.cost)} · {t("active")}
                  </Text>
                </Box>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
