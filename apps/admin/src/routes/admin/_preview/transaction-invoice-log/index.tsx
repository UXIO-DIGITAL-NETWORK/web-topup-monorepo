import { createFileRoute } from "@tanstack/react-router";
import { InvoiceLogPage } from "@/features/transactions";

export const Route = createFileRoute("/admin/_preview/transaction-invoice-log/")({
  component: InvoiceLogPage,
});
