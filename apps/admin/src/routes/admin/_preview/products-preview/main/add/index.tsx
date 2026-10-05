import { createFileRoute } from "@tanstack/react-router";
import { AddProductsPage, type AddMode } from "@/features/products";

/**
 * Unauthenticated preview twin of the Add Products page — same component, no
 * `_protected` guard, so the screen can be shared for design review.
 */
export const Route = createFileRoute("/admin/_preview/products-preview/main/add/")({
  validateSearch: (search: Record<string, unknown>): { mode: AddMode } => ({
    mode: search.mode === "bulk" ? "bulk" : "single",
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { mode } = Route.useSearch();
  return <AddProductsPage mode={mode} />;
}
