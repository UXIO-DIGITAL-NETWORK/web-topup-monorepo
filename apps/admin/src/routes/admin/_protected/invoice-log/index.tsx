import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/middlewares/authMiddleware";
import { InvoiceLogPage } from "@/features/transactions";

export const Route = createFileRoute("/admin/_protected/invoice-log/")({
  beforeLoad: () => requirePermission("transactions.view"),
  component: InvoiceLogPage,
});
