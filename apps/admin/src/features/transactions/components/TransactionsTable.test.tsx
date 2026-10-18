import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { render, screen } from "@/test/test-utils";
import { TransactionsTable } from "./TransactionsTable";

const baseProps = {
  columns: [],
  data: [],
  page: 1,
  pageSize: 10,
  total: 0,
  lastPage: 1,
  onPageChange: vi.fn(),
  onPageSizeChange: vi.fn(),
  sorting: [],
  onSortingChange: vi.fn(),
};

/**
 * Empty state: title + description always; the "Clear filters" action only
 * when the page says filters are narrowing the list (`onResetFilters`).
 */
describe("TransactionsTable empty state", () => {
  it("explains there are no transactions yet, without an action, when nothing is filtered", () => {
    render(<TransactionsTable {...baseProps} />);

    expect(screen.getByText("No transactions yet")).toBeInTheDocument();
    expect(screen.getByText("Orders will appear here once customers start checking out.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("offers Clear filters when filters are active, and calls the reset handler", async () => {
    const onResetFilters = vi.fn();
    render(
      <TransactionsTable
        {...baseProps}
        onResetFilters={onResetFilters}
      />,
    );

    expect(screen.getByText("No matching transactions")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onResetFilters).toHaveBeenCalledTimes(1);
  });
});
