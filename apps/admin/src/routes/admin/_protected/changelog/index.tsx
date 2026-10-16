import { createFileRoute } from "@tanstack/react-router";
import { ChangelogPage } from "@/features/changelog";

export const Route = createFileRoute("/admin/_protected/changelog/")({
  component: ChangelogPage,
});
