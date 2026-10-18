import { createFileRoute, redirect } from "@tanstack/react-router";

// Refunds moved under Transactions; keep the old URL working for bookmarks.
export const Route = createFileRoute("/admin/_protected/refunds/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/transactions/refunds" });
  },
});
