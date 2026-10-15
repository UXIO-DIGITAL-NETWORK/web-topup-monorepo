import { useTranslation } from "react-i18next";
import { useState } from "react";

import { useCategoryList } from "@/features/categories/hooks/useCategories";
import { usePaymentChannelList, useUserList } from "@/features/administration/hooks/useAdministration";
import { useProductList } from "@/features/products/hooks/useProducts";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { BUYER_ROLES } from "../data/select-options.data";
import { SearchableSelect, type SearchableOption } from "./SearchableSelect";

/**
 * The four filter dropdowns that need real data: they used to be fixed lists of
 * invented ids, which meant picking one could only ever return nothing.
 *
 * Each one searches the endpoint that owns the rows, so the list is the site's
 * actual users/products/categories/channels rather than a fixture that drifts
 * away from them.
 */
const PER_PAGE = 20;

interface FilterComboboxProps {
  id: string;
  value?: string;
  onChange: (value: string | undefined) => void;
}

/**
 * The search term and the picked row, kept together because the picked row is
 * usually not in the next page of results — without holding it, the trigger
 * would fall back to showing a raw id after any further typing.
 */
function useComboboxState(onChange: (value: string | undefined) => void) {
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<SearchableOption | undefined>(undefined);
  const search = useDebouncedValue(term);

  return {
    search,
    onSearch: setTerm,
    selectedLabel: selected?.label,
    onChange: (option: SearchableOption | undefined) => {
      setSelected(option);
      onChange(option?.value);
    },
  };
}

export function UserFilterCombobox({ id, value, onChange }: FilterComboboxProps) {
  const { t } = useTranslation("transactions");
  const state = useComboboxState(onChange);
  const { data, isFetching } = useUserList({
    roles: BUYER_ROLES,
    search: state.search || undefined,
    per_page: PER_PAGE,
  });

  return (
    <SearchableSelect
      id={id}
      label={t("colUser")}
      placeholder={t("allUsers")}
      searchPlaceholder={t("searchUsers")}
      emptyLabel={t("noUsersFound")}
      value={value}
      selectedLabel={state.selectedLabel}
      isLoading={isFetching}
      onSearch={state.onSearch}
      onChange={state.onChange}
      options={(data?.data ?? []).map((user) => ({
        value: user.id,
        label: user.name,
        detail: user.email || undefined,
      }))}
    />
  );
}

export function CategoryFilterCombobox({ id, value, onChange }: FilterComboboxProps) {
  const { t } = useTranslation("transactions");
  const state = useComboboxState(onChange);
  const { data, isFetching } = useCategoryList({ search: state.search || undefined, per_page: PER_PAGE });

  return (
    <SearchableSelect
      id={id}
      label={t("category")}
      placeholder={t("allCategories")}
      searchPlaceholder={t("searchCategories")}
      emptyLabel={t("noCategoriesFound")}
      value={value}
      selectedLabel={state.selectedLabel}
      isLoading={isFetching}
      onSearch={state.onSearch}
      onChange={state.onChange}
      options={(data?.data ?? []).map((category) => ({
        value: category.id,
        label: category.name,
        detail: category.code || undefined,
      }))}
    />
  );
}

export function ProductFilterCombobox({ id, value, onChange }: FilterComboboxProps) {
  const { t } = useTranslation("transactions");
  const state = useComboboxState(onChange);
  const { data, isFetching } = useProductList({ search: state.search || undefined, per_page: PER_PAGE });

  return (
    <SearchableSelect
      id={id}
      label={t("product")}
      placeholder={t("allProducts")}
      searchPlaceholder={t("searchProducts")}
      emptyLabel={t("noProductsFound")}
      value={value}
      selectedLabel={state.selectedLabel}
      isLoading={isFetching}
      onSearch={state.onSearch}
      onChange={state.onChange}
      options={(data?.data ?? []).map((product) => ({
        value: product.id,
        label: product.name,
        detail: product.code || undefined,
      }))}
    />
  );
}

export function PaymentMethodFilterCombobox({ id, value, onChange }: FilterComboboxProps) {
  const { t } = useTranslation("transactions");
  const state = useComboboxState(onChange);
  const { data, isFetching } = usePaymentChannelList({ search: state.search || undefined, per_page: PER_PAGE });

  return (
    <SearchableSelect
      id={id}
      label={t("paymentMethod")}
      placeholder={t("allMethods")}
      searchPlaceholder={t("searchMethods")}
      emptyLabel={t("noMethodsFound")}
      value={value}
      selectedLabel={state.selectedLabel}
      isLoading={isFetching}
      onSearch={state.onSearch}
      onChange={state.onChange}
      options={(data?.data ?? []).map((channel) => ({
        value: channel.id,
        label: channel.name,
        detail: channel.channel_code || undefined,
      }))}
    />
  );
}
