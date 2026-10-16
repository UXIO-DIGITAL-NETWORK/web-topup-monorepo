import { useTranslation } from "react-i18next";
import { useState } from "react";

import { Box } from "@/components/common/Box";
import { Text } from "@/components/common/Text";
import { Input } from "@/components/ui/input";
import { humanize } from "../lib/settingLabels";

interface JsonNumberMapFieldProps {
  id: string;
  /** The stored JSON string, still in that shape so the bulk save is untouched. */
  value: string;
  onChange: (value: string) => void;
}

/** One row per name, holding its own text so a cleared figure can be retyped. */
type Row = { name: string; minutes: string };

function parse(value: string): Row[] {
  try {
    const parsed = JSON.parse(value || "{}");

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

    return Object.entries(parsed).map(([name, minutes]) => ({ name, minutes: String(minutes) }));
  } catch {
    return [];
  }
}

/**
 * The editor for a JSON object of numbers — how long each payment method stays
 * payable.
 *
 * The names are a fixed vocabulary that arrives with the stored value, so there
 * is nothing to add or remove: one row is one payment method and one figure.
 * The methods genuinely disagree by hours, which is why this is a map and not
 * the single number the field used to be.
 */
export function JsonNumberMapField({ id, value, onChange }: JsonNumberMapFieldProps) {
  const { t } = useTranslation("administration");
  const [rows, setRows] = useState<Row[]>(() => parse(value));

  const commit = (next: Row[]) => {
    setRows(next);

    // A cleared row is left out of the object rather than stored as 0 — which
    // would expire that payment the instant it was created — or as null. Omitting
    // the name is exactly what tells PaymentExpiry to fall back to its own
    // window for that method.
    const entries = next
      .map((row) => [row.name, Number(row.minutes)] as const)
      .filter(([, minutes]) => Number.isFinite(minutes) && minutes > 0);

    onChange(JSON.stringify(Object.fromEntries(entries)));
  };

  return (
    <Box className="flex flex-col gap-3">
      {rows.map((row) => (
        <Box
          key={row.name}
          className="flex flex-col gap-1.5"
        >
          <Box className="flex items-baseline justify-between gap-3">
            <Text
              as="span"
              className="text-sm"
            >
              {t(`channel_${row.name}`, { defaultValue: humanize(row.name) })}
            </Text>
            <Text
              as="span"
              variant="small"
            >
              {t("minutes")}
            </Text>
          </Box>
          <Input
            id={`${id}-${row.name}`}
            type="number"
            inputMode="numeric"
            min={1}
            className="w-full rounded-xl"
            value={row.minutes}
            onChange={(event) =>
              commit(rows.map((entry) => (entry.name === row.name ? { ...entry, minutes: event.target.value } : entry)))
            }
          />
        </Box>
      ))}
    </Box>
  );
}
