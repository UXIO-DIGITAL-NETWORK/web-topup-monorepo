import type { ReactNode } from "react";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Text } from "@/components/common/Text";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SelectFieldOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  label: string;
  options: SelectFieldOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Shown in place of the list when `options` is empty. */
  emptyLabel?: string;
  /** Optional explanation rendered as an info tooltip beside the label. */
  tooltip?: ReactNode;
  /** Marks the field as required (red `*`) and sets `aria-required`. */
  required?: boolean;
  /** Marks the field as optional (`(Opsional)`); ignored when `required`. */
  optional?: boolean;
}

/**
 * A labelled shadcn `Select` with its error line — the shape every form page
 * repeats. Written for Add Category, promoted here when Products' Add form
 * became the second caller.
 *
 * `Select` is used rather than a raw control so the trigger keeps its
 * `combobox` role and the label association tests query by.
 */
export function SelectField({
  id,
  label,
  options,
  value,
  onChange,
  error,
  placeholder = "Type to search...",
  disabled = false,
  emptyLabel = "No options available",
  tooltip,
  required,
  optional,
}: SelectFieldProps) {
  return (
    <Box className="flex flex-col gap-1.5">
      <FieldLabel
        htmlFor={id}
        tooltip={tooltip}
        required={required}
        optional={optional}
      >
        {label}
      </FieldLabel>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-required={required || undefined}
          className="w-full rounded-xl"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <Box className="px-2 py-1.5">
              <Text
                variant="small"
                className="text-muted-foreground"
              >
                {emptyLabel}
              </Text>
            </Box>
          ) : (
            options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {error && (
        <Text
          variant="small"
          className="text-destructive"
        >
          {error}
        </Text>
      )}
    </Box>
  );
}
