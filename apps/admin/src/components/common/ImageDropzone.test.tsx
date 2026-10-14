import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ImageDropzone } from "./ImageDropzone";

/**
 * The uploading state.
 *
 * Encoding and uploading used to be invisible here: the dropzone kept the
 * Browse button live and left its own text on the picked filename for the whole
 * request, so a slow upload looked like a click that did nothing. The flag is
 * the caller's — it owns the mutation — and these two cases are what the
 * callers rely on it doing.
 */
const setup = (uploading = false) =>
  render(
    <ImageDropzone
      id="logo"
      label="Logo"
      caption="Up to 2 MB"
      onChange={vi.fn()}
      uploading={uploading}
    />,
  );

describe("ImageDropzone", () => {
  it("disables the picker and names the wait while a file is uploading", () => {
    setup(true);

    expect(screen.getByText("Uploading…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse files" })).toBeDisabled();
    expect(screen.getByLabelText("Logo")).toBeDisabled();
  });

  it("stays usable when nothing is in flight", () => {
    setup();

    expect(screen.queryByText("Uploading…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse files" })).toBeEnabled();
    expect(screen.getByLabelText("Logo")).toBeEnabled();
  });
});

/**
 * The image the record already has.
 *
 * `value` only ever carries a *newly picked* file, so a record with artwork used
 * to look exactly like one without: the field read as empty. The Preview button
 * is both the way to look at the stored image and the sign that one exists — and
 * it steps aside once a replacement is picked, because then the field already
 * says what is about to be saved.
 */
describe("ImageDropzone stored image", () => {
  const STORED = "http://api.test/storage/logos/a.webp";
  const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

  afterEach(() => {
    openSpy.mockClear();
  });

  it("offers the stored image and opens it in its own tab", async () => {
    const user = userEvent.setup();
    render(
      <ImageDropzone
        id="logo"
        label="Logo"
        caption="Up to 2 MB"
        onChange={vi.fn()}
        existingUrl={STORED}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(openSpy).toHaveBeenCalledWith(STORED, "_blank", "noopener,noreferrer");
  });

  it("offers nothing when the record has no image", () => {
    setup();

    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("steps aside once a replacement has been picked", () => {
    render(
      <ImageDropzone
        id="logo"
        label="Logo"
        caption="Up to 2 MB"
        onChange={vi.fn()}
        value={new File(["x"], "new.png", { type: "image/png" })}
        existingUrl={STORED}
      />,
    );

    expect(screen.getByText("new.png")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
  });
});
