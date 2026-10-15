import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: string;
  label: string;
  /** Second line — a user's email, a product's code. */
  detail?: string;
}

interface SearchableSelectProps {
  id: string;
  label: string;
  /** Also the label of the "clear" row, and what the closed trigger shows when nothing is picked. */
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  value?: string;
  /**
   * The label of the current selection, held by the caller: the options here are
   * one page of a server-side search, so the chosen row is usually not in them
   * any more by the time the trigger renders.
   */
  selectedLabel?: string;
  options: SearchableOption[];
  isLoading?: boolean;
  onSearch: (term: string) => void;
  onChange: (option: SearchableOption | undefined) => void;
}

/**
 * A filter dropdown whose options come from the API, searched as you type.
 *
 * Client-side filtering is switched off (`shouldFilter={false}`) on purpose: the
 * server has already narrowed the list, and it may have matched on something the
 * label does not show (a phone number, a product code), so re-filtering in the
 * browser would hide the very rows the search was for.
 */
export function SearchableSelect({
  id,
  label,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  value,
  selectedLabel,
  options,
  isLoading,
  onSearch,
  onChange,
}: SearchableSelectProps) {
  const { t } = useTranslation("transactions");
  const [open, setOpen] = useState(false);

  return (
    <Box className="flex flex-col gap-2.5">
      <Label htmlFor={id}>{label}</Label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Each opening starts from the full list rather than the last search.
          if (!next) onSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between rounded-xl font-normal"
          >
            <Text
              as="span"
              className={cn("truncate", !value && "text-muted-foreground")}
            >
              {value ? (selectedLabel ?? value) : placeholder}
            </Text>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              onValueChange={onSearch}
            />
            <CommandList>
              <CommandEmpty>{isLoading ? t("searching") : emptyLabel}</CommandEmpty>
              {value ? (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(undefined);
                    setOpen(false);
                  }}
                >
                  <Text
                    as="span"
                    variant="muted"
                  >
                    {placeholder}
                  </Text>
                </CommandItem>
              ) : null}
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === option.value ? "opacity-100" : "opacity-0")} />
                  <Box className="flex flex-1 flex-col">
                    <Text
                      as="span"
                      variant="small"
                    >
                      {option.label}
                    </Text>
                    {option.detail ? (
                      <Text
                        as="span"
                        variant="small"
                        className="text-muted-foreground"
                      >
                        {option.detail}
                      </Text>
                    ) : null}
                  </Box>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Box>
  );
}
