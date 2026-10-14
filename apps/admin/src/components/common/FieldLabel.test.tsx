import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { FieldLabel } from "./FieldLabel";
import { TooltipProvider } from "@/components/ui/tooltip";

const renderField = (ui: React.ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe("FieldLabel", () => {
  it("renders the label text", () => {
    renderField(<FieldLabel htmlFor="x">Category Code</FieldLabel>);
    expect(screen.getByText("Category Code")).toBeInTheDocument();
  });

  it("shows an info trigger only when a tooltip is provided", () => {
    const { rerender } = renderField(<FieldLabel htmlFor="x">Plain</FieldLabel>);
    expect(screen.queryByRole("button", { name: "More information" })).not.toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <FieldLabel
          htmlFor="x"
          tooltip="Explains the field"
        >
          With hint
        </FieldLabel>
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "More information" })).toBeInTheDocument();
  });

  it("renders a required marker that stays out of the accessible name", () => {
    renderField(
      <FieldLabel
        htmlFor="x"
        required
      >
        Category Code
      </FieldLabel>,
    );

    expect(screen.getByText("Category Code")).toBeInTheDocument();
    // aria-hidden keeps "*" out of the label's accessible name, so the
    // label-text queries across the suite keep matching "Category Code".
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText("(Optional)")).not.toBeInTheDocument();
  });

  it("renders an optional marker", () => {
    renderField(
      <FieldLabel
        htmlFor="x"
        optional
      >
        Sub Title
      </FieldLabel>,
    );

    expect(screen.getByText("Sub Title")).toBeInTheDocument();
    expect(screen.getByText("(Optional)")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });
});
