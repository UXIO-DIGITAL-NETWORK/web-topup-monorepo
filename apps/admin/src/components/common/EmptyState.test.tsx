import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("shows the title and description under an illustration", () => {
    const { container } = render(
      <EmptyState
        title="Nothing here"
        description="Come back later."
      />,
    );

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Come back later.")).toBeInTheDocument();
    // Decorative: the title already says what the picture means.
    // (The Image primitive shows its fallback src until the file loads, so the
    // path itself is not assertable under jsdom.)
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("renders the action only when one is given", () => {
    const { rerender } = render(<EmptyState title="Nothing here" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <EmptyState
        title="Nothing here"
        action={<button type="button">Try again</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
