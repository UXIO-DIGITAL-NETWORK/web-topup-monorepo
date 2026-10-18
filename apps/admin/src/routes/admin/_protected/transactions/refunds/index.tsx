import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/middlewares/authMiddleware";
import { RefundsPage } from "@/features/refunds";

export const Route = createFileRoute("/admin/_protected/transactions/refunds/")({
  beforeLoad: () => requirePermission("refunds.view"),
  component: RefundsPage,
});
