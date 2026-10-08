import type { ChangeEvent } from "react";
import type { Path, UseFormRegister } from "react-hook-form";

import type { ProductFormValues } from "../schemas/productForm.schema";

/**
 * `register(...)`, but the input's value is filtered through `sanitize` before
 * react-hook-form reads it — so a numeric field can never hold a letter, typed
 * or pasted, while the field stays registered and validated as usual.
 */
export function numericRegister(
  register: UseFormRegister<ProductFormValues>,
  name: Path<ProductFormValues>,
  sanitize: (value: string) => string,
) {
  const { onChange, ...rest } = register(name);
  return {
    ...rest,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      event.target.value = sanitize(event.target.value);
      onChange(event);
    },
  };
}
