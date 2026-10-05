import { createFileRoute } from "@tanstack/react-router";
import { AddProductsPage, type AddMode } from "@/features/products";

/**
 * Add Products as a full page. The Single/Massal choice rides in `?mode=` so the
 * toolbar dropdown can open the page pre-set, and the page stays linkable and
 * refresh-safe.
 */
export const Route = createFileRoute("/admin/_protected/products/main/add/")({
  validateSearch: (search: Record<string, unknown>): { mode: AddMode } => ({
    mode: search.mode === "bulk" ? "bulk" : "single",
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { mode } = Route.useSearch();
  return <AddProductsPage mode={mode} />;
}
