import { createFileRoute } from "@tanstack/react-router";
import { ArchivedProductsPage } from "@/features/products";

export const Route = createFileRoute("/admin/_preview/products-preview/archived/")({
  component: ArchivedProductsPage,
});
