import { createFileRoute } from "@tanstack/react-router";
import { ArchivedProductsPage } from "@/features/products";

export const Route = createFileRoute("/admin/_protected/products/archived/")({
  component: ArchivedProductsPage,
});
