import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Box } from "@/components/common/Box";
import { FieldLabel } from "@/components/common/FieldLabel";
import { Text } from "@/components/common/Text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineCategoryCreate } from "./InlineCategoryCreate";
import { useSupplierOptions } from "../hooks/useSupplierOptions";
import { useProviderCategoryOptions } from "../hooks/useProviderCategoryOptions";
import { useCategoryList } from "../hooks/useCategories";
import {
  useCategoryProvider,
  useCreateCategoryProvider,
  useUpdateCategoryProvider,
} from "../hooks/useCategoryProviders";
import { categoryProviderFormSchema, type CategoryProviderFormValues } from "../schemas/categoryProviderForm.schema";
import type { Category } from "../types/category.type";

const CATEGORY_OPTIONS_PAGE_SIZE = 100;
const EMPTY_VALUES: CategoryProviderFormValues = { supplierId: "", categoryId: "", providerCategory: "" };

/**
 * Suppliers with a live catalogue integration, lower-cased. Matched on the name
 * because that is how the whole provider pipeline resolves it server-side
 * (`App\Support\Uxiolabs\UxiolabsSupplier`), and `suppliers` carries no
 * "integrated" flag to key on — `is_system` marks the internal supplier, not this.
 *
 * Every spelling that name has ever had is listed, because the name is stored
 * DATA: the provider is "Uxiotopup" again after a rename, and a build that only
 * knew the new spelling would filter the select down to nothing — an empty
 * dropdown, not an error. Add the old spelling here on any future rename.
 *
 * The Provider select offers only these. A second integrated supplier is a
 * one-line addition here, not a rework.
 */
const INTEGRATED_PROVIDERS = ["uxiotopup", "uxiolabs"];

interface CategoryProviderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = add mode. */
  categoryProviderId?: string;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text
      variant="small"
      className="text-destructive"
    >
      {message}
    </Text>
  );
}

/**
 * Add / Edit Category Provider.
 *
 * This mapping is what decides which of the provider's SKUs the pool offers for
 * a category, so the Provider Category select reads the provider's live
 * catalogue rather than a hardcoded list. The API groups that catalogue by its
 * own `kategori`, so each value appears exactly once however many SKUs share it,
 * and reports which ones are already mapped — those are shown under a separate
 * "Already added" heading and cannot be picked twice.
 */
export function CategoryProviderFormDialog({
  open,
  onOpenChange,
  categoryProviderId,
}: CategoryProviderFormDialogProps) {
  const { t } = useTranslation("categories");
  const isEdit = Boolean(categoryProviderId);

  const [creatingCategory, setCreatingCategory] = useState(false);

  const { data: categories } = useCategoryList({ per_page: CATEGORY_OPTIONS_PAGE_SIZE });
  const { data: existing } = useCategoryProvider(open ? categoryProviderId : undefined);

  const { options: supplierOptions } = useSupplierOptions();
  const createCategoryProvider = useCreateCategoryProvider();
  const updateCategoryProvider = useUpdateCategoryProvider();
  const isPending = createCategoryProvider.isPending || updateCategoryProvider.isPending;

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CategoryProviderFormValues>({
    resolver: zodResolver(categoryProviderFormSchema),
    defaultValues: EMPTY_VALUES,
    // `values` (not `defaultValues`) so the form re-syncs once the record
    // resolves — on edit it is undefined for the first render.
    values: existing
      ? {
          supplierId: existing.supplier_id ?? "",
          categoryId: existing.category_id,
          providerCategory: existing.provider_category,
        }
      : undefined,
  });

  const selectedSupplierId = watch("supplierId");

  // Only suppliers with a catalogue are offerable. The others could be selected
  // before, but the field below would then refuse to load anything for them —
  // a choice whose only outcome was a dead end.
  const providerOptions = useMemo(() => {
    const offerable = supplierOptions
      .filter((option) => INTEGRATED_PROVIDERS.includes(option.label.toLowerCase()))
      .map((option) => ({ ...option, disabled: false }));

    // An existing row may point at a supplier that is no longer offerable. Keep it
    // in the list, disabled, so editing that row shows what it actually maps to
    // instead of rendering an empty select that reads as lost data.
    const stored = supplierOptions.find((option) => option.value === existing?.supplier_id);
    if (stored && !offerable.some((option) => option.value === stored.value)) {
      return [...offerable, { ...stored, disabled: true }];
    }

    return offerable;
  }, [supplierOptions, existing?.supplier_id]);

  // With one offerable provider, making the admin open the select to pick it is a
  // click that carries no decision. Add mode only — on edit the stored value wins.
  useEffect(() => {
    if (!open || isEdit || selectedSupplierId) return;

    const [only] = providerOptions.filter((option) => !option.disabled);
    if (only && providerOptions.filter((option) => !option.disabled).length === 1) {
      setValue("supplierId", only.value);
    }
  }, [open, isEdit, selectedSupplierId, providerOptions, setValue]);

  const selectedProviderName =
    supplierOptions.find((option) => option.value === selectedSupplierId)?.label ?? "";
  const isIntegratedProvider = INTEGRATED_PROVIDERS.includes(selectedProviderName.toLowerCase());

  // Only fetch once a provider that actually has a catalogue is chosen — the
  // endpoint is uxiolabs's, and its "already mapped" answers are computed
  // against uxiolabs alone.
  const { options: providerCategories, isLoading: isLoadingProviderCategories } =
    useProviderCategoryOptions(open && isIntegratedProvider);

  const currentValue = existing?.provider_category;

  const { available, alreadyAdded } = useMemo(() => {
    const available: typeof providerCategories = [];
    const alreadyAdded: typeof providerCategories = [];

    for (const option of providerCategories) {
      // The row being edited keeps its own value selectable; every other mapped
      // value is already spoken for.
      const isOwnValue = currentValue !== undefined && option.value === currentValue;
      if (option.mapped_category_id && !isOwnValue) {
        alreadyAdded.push(option);
      } else {
        available.push(option);
      }
    }

    return { available, alreadyAdded };
  }, [providerCategories, currentValue]);

  // On edit, a value saved before the provider dropped or renamed that category
  // would otherwise vanish from the list and read as "nothing selected".
  const isCurrentValueMissing =
    isEdit &&
    Boolean(currentValue) &&
    !isLoadingProviderCategories &&
    isIntegratedProvider &&
    !providerCategories.some((option) => option.value === currentValue);

  const onSubmit = (values: CategoryProviderFormValues) => {
    const payload = {
      supplier_id: values.supplierId,
      category_id: values.categoryId,
      provider_category: values.providerCategory,
    };
    const onSuccess = () => onOpenChange(false);

    if (categoryProviderId) {
      updateCategoryProvider.mutate({ id: categoryProviderId, input: payload }, { onSuccess });
      return;
    }
    createCategoryProvider.mutate(payload, { onSuccess });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Category Provider" : "Add Category Provider"}</DialogTitle>
          <DialogDescription>{t("providerFormHint")}</DialogDescription>
        </DialogHeader>

        <Box
          as="form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <Controller
            control={control}
            name="supplierId"
            render={({ field }) => (
              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="category-provider-provider"
                  required
                >{t("provider")}</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger
                    id="category-provider-provider"
                    aria-required="true"
                    className="w-full rounded-xl"
                  >
                    <SelectValue placeholder={t("selectProvider")} />
                  </SelectTrigger>
                  <SelectContent>
                    {providerOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                      >
                        {option.label}
                        {option.disabled && (
                          <Text
                            as="span"
                            variant="small"
                            className="text-muted-foreground"
                          >
                            no catalogue integration
                          </Text>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.supplierId?.message} />
              </Box>
            )}
          />

          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Box className="flex flex-col gap-1.5">
                {/* The button sits beside the Label, never inside it — putting it
                    within would change the select's accessible name. */}
                <Box className="flex items-center justify-between gap-2">
                  <FieldLabel
                    htmlFor="category-provider-category"
                    required
                  >{t("category")}</FieldLabel>
                  {!creatingCategory && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-lg"
                      onClick={() => setCreatingCategory(true)}
                    >
                      + New category
                    </Button>
                  )}
                </Box>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger
                    id="category-provider-category"
                    aria-required="true"
                    className="w-full rounded-xl"
                  >
                    <SelectValue placeholder={t("selectCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories?.data ?? []).map((category) => (
                      <SelectItem
                        key={category.id}
                        value={category.id}
                      >
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {creatingCategory && (
                  <InlineCategoryCreate
                    onCreated={(category: Category) => {
                      // Select it straight away: the admin opened this panel because
                      // this is the category they were about to map.
                      field.onChange(category.id);
                      setCreatingCategory(false);
                    }}
                    onCancel={() => setCreatingCategory(false)}
                  />
                )}

                <FieldError message={errors.categoryId?.message} />
              </Box>
            )}
          />

          <Controller
            control={control}
            name="providerCategory"
            render={({ field }) => (
              <Box className="flex flex-col gap-1.5">
                <FieldLabel
                  htmlFor="category-provider-provider-category"
                  required
                >{t("colProviderCategory")}</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={!isIntegratedProvider}
                >
                  <SelectTrigger
                    id="category-provider-provider-category"
                    aria-required="true"
                    className="w-full rounded-xl"
                  >
                    <SelectValue
                      placeholder={
                        !selectedSupplierId
                          ? "Select a provider first"
                          : !isIntegratedProvider
                            ? "This provider has no catalogue integration"
                            : isLoadingProviderCategories
                              ? "Loading the provider's categories..."
                              : "Select a provider category"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {available.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>{t("available")}</SelectLabel>
                        {available.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                          >
                            {option.value}
                            <Text
                              as="span"
                              variant="small"
                              className="text-muted-foreground tabular-nums"
                            >
                              {option.available_count} of {option.sku_count} SKUs active
                            </Text>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}

                    {alreadyAdded.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>{t("alreadyAdded")}</SelectLabel>
                        {alreadyAdded.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            disabled
                          >
                            {option.value}
                            <Text
                              as="span"
                              variant="small"
                              className="text-muted-foreground"
                            >
                              already mapped to {option.mapped_category_name ?? "another category"}
                            </Text>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}

                    {isIntegratedProvider && !isLoadingProviderCategories && providerCategories.length === 0 && (
                      <Box className="px-2 py-3">
                        <Text
                          variant="small"
                          className="text-muted-foreground"
                        >{t("noProviderCategories")}</Text>
                      </Box>
                    )}
                  </SelectContent>
                </Select>

                {isCurrentValueMissing && (
                  <Text
                    variant="small"
                    className="text-destructive"
                  >
                    &ldquo;{currentValue}&rdquo; is no longer published by the provider. Pick a current one, or this
                    mapping will match no SKUs.
                  </Text>
                )}

                {selectedSupplierId && !isIntegratedProvider && (
                  <Text
                    variant="small"
                    className="text-muted-foreground"
                  >{t("onlyUxiolabs")}</Text>
                )}

                {isIntegratedProvider && alreadyAdded.length > 0 && (
                  <Text
                    variant="small"
                    className="text-muted-foreground"
                  >
                    <Badge
                      variant="outline"
                      className="mr-1.5"
                    >
                      {alreadyAdded.length}
                    </Badge>
                    already mapped and hidden from selection, so the same catalogue cannot be added twice.
                  </Text>
                )}

                <FieldError message={errors.providerCategory?.message} />
              </Box>
            )}
          />

          <Box className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
            >{t("cancel")}</Button>
            <Button
              type="submit"
              className="rounded-xl"
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
