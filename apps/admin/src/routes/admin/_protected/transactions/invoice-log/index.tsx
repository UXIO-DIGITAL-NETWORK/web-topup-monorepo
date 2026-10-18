import { createFileRoute, redirect } from "@tanstack/react-router";

// Invoice Log left the Transactions tabs for its own sidebar entry; keep the old URL working.
export const Route = createFileRoute("/admin/_protected/transactions/invoice-log/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/invoice-log" });
  },
});
