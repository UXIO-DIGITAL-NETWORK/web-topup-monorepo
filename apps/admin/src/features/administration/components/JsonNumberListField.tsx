import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/utils/currency";

interface JsonNumberListFieldProps {
  id: string;
  /** The stored JSON string, still in that shape so the bulk save is untouched. */
  value: string;
  onChange: (value: string) => void;
}

function parse(value: string): string[] {
  try {
    const parsed = JSON.parse(value || "[]");

    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

/** The rupiah the admin is entering, or nothing at all while the row is empty. */
function preview(amount: string): string {
  const parsed = Number(amount);

  return amount.trim() !== "" && Number.isFinite(parsed) ? formatCurrency(parsed, { fractionDigits: 0 }) : "";
}

/**
 * The editor for a JSON array of numbers — the wallet top-up presets.
 *
 * That value is stored as `[10000,25000,…]`, and asking an operator to type
 * brackets and commas was the whole problem. The JSON still travels in the
 * draft, so the save path and the API contract are unchanged; it just never has
 * to be seen or written by hand.
 *
 * Rows hold the text exactly as typed, including one the admin has just cleared
 * in order to retype it. The stored value only ever gets the usable subset, but
 * a row that would vanish the moment it was emptied could never be refilled.
 */
export function JsonNumberListField({ id, value, onChange }: JsonNumberListFieldProps) {
  const { t } = useTranslation("administration");
  const [rows, setRows] = useState<string[]>(() => parse(value));

  const commit = (next: string[]) => {
    setRows(next);

    // Whole positive amounts only, de-duplicated. These become the buttons a
    // customer taps on the top-up form, so a 0 or a repeat is a slip rather
    // than an intention.
    const amounts = [...new Set(next.map(Number).filter((amount) => Number.isInteger(amount) && amount > 0))];

    onChange(JSON.stringify(amounts));
  };

  return (
    <Box className="flex flex-col gap-3">
      {rows.length === 0 && <Text variant="small">{t("presetsEmptyHint")}</Text>}

      {rows.map((amount, index) => (
        <Box
          key={index}
          className="flex items-center gap-2"
        >
          <Input
            id={index === 0 ? id : `${id}-${index}`}
            type="number"
            inputMode="numeric"
            placeholder="0"
            min={0}
            className="rounded-xl"
            value={amount}
            onChange={(event) => {
              const next = [...rows];
              next[index] = event.target.value;
              commit(next);
            }}
          />
          <Text
            as="span"
            variant="small"
            className="w-24 shrink-0 text-right tabular-nums"
          >
            {preview(amount)}
          </Text>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label={t("removeNominal", { index: index + 1 })}
            onClick={() => commit(rows.filter((_, position) => position !== index))}
          >
            <Trash2 className="size-4" />
          </Button>
        </Box>
      ))}

      <Box>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => commit([...rows, ""])}
        >
          <Plus className="size-4" />
          {t("presetsAddNominal")}
        </Button>
      </Box>
    </Box>
  );
}
