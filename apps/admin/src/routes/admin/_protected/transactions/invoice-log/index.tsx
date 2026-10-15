import { createFileRoute } from "@tanstack/react-router";
import { InvoiceLogPage } from "@/features/transactions";

export const Route = createFileRoute("/admin/_protected/transactions/invoice-log/")({
  component: InvoiceLogPage,
});
