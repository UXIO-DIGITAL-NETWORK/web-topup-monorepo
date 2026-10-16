import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { makeUser, renderRoute, screen } from "@/test/test-utils";
import { useAuthStore } from "@/store/useAuthStore";

// The page marks whichever release matches the running build, and normally that
// version is baked at build time and empty under vitest. The test has to be able
// to say which build it is looking at, so the stamp is stubbed here — everything
// else in `ENV` is left as the app under test expects it.
vi.mock("@/config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/env")>();

  return { ...actual, ENV: { ...actual.ENV, APP_VERSION: "v1.4.8" } };
});

const PATH = "/admin/changelog";

/**
 * The card for one release.
 *
 * Anchored on the version badge rather than on the version text: the sidebar's
 * release stamp shows the same string when the running build is the one being
 * looked for, and `data-slot="badge"` is already on the element the page owns.
 */
function releaseCard(version: string): HTMLElement {
  const badge = screen
    .getAllByText(version)
    .find((element) => element.getAttribute("data-slot") === "badge");

  if (!badge) throw new Error(`Tidak ada kartu rilis untuk ${version}`);

  const card = badge.closest(".rounded-2xl");
  if (!(card instanceof HTMLElement)) throw new Error(`Kartu rilis ${version} tidak ditemukan`);

  return card;
}

describe("ChangelogPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: "test-token", user: makeUser(), permissions: ["*"] });
    localStorage.clear();
  });

  afterEach(() => {
    useAuthStore.setState({ token: null, user: null, permissions: [] });
  });

  it("lists releases with the notes written for an admin", async () => {
    await renderRoute(PATH);
    await screen.findByRole("tab", { name: "Features" });

    expect(releaseCard("v1.4.8")).toHaveTextContent(
      /paket keanggotaan yang harganya benar-benar dipakai/,
    );
  });

  it("marks the running build, and only that one", async () => {
    await renderRoute(PATH);
    await screen.findByRole("tab", { name: "Features" });

    expect(releaseCard("v1.4.8")).toHaveTextContent("Running now");
    expect(releaseCard("v1.4.9")).not.toHaveTextContent("Running now");
  });

  it("says plainly when a release changed nothing an admin can see", async () => {
    await renderRoute(PATH);
    await screen.findByRole("tab", { name: "Features" });

    // v1.4.9 was deploy plumbing only. Padding it with an invented feature would
    // be worse than admitting there was nothing to see.
    expect(releaseCard("v1.4.9")).toHaveTextContent(
      "This release changed nothing visible in the panel.",
    );
  });

  it("keeps the developer notes behind their own tab", async () => {
    const user = userEvent.setup();
    await renderRoute(PATH);
    await screen.findByRole("tab", { name: "Features" });

    // Not on the admin's view: the wording there is deliberately free of module
    // names, and this is where that is enforced.
    expect(screen.queryByText(/harga plan per transaksi/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Technical" }));

    expect(await screen.findByText(/harga plan per transaksi/)).toBeInTheDocument();
  });

  it("clears the unread marker once the page has been opened", async () => {
    await renderRoute(PATH);
    await screen.findByRole("tab", { name: "Features" });

    expect(localStorage.getItem("admin-changelog-seen")).toBe("v1.4.8");
  });
});
