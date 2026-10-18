import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderRoute, screen, makeUser, waitFor } from "@/test/test-utils";
import { useAuthStore } from "@/store/useAuthStore";
import { authService } from "@/features/auth/services/auth.service";

/**
 * The navbar's controls, as opposed to what it displays.
 *
 * Each case here covers something that was silently wrong: a logout that left
 * the server session alive, and a page title that claimed every screen was the
 * dashboard.
 */
beforeEach(() => {
  useAuthStore.setState({ token: "test-token", user: makeUser(), permissions: ["*"] });
});

afterEach(() => {
  useAuthStore.setState({ token: null, user: null, permissions: [] });
  vi.restoreAllMocks();
});

const openUserMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: /open user menu/i }));
};

describe("navbar logout", () => {
  it("revokes the session on the server, not just the cookies", async () => {
    // The panel keeps its tokens in JavaScript-readable cookies, and the
    // refresh token lives 30 days. Clearing them locally while the server still
    // honours them is not a logout.
    const logout = vi.spyOn(authService, "logout").mockResolvedValue({} as never);

    const user = userEvent.setup();
    await renderRoute("/admin/dashboard");

    await openUserMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: /log out/i }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("signs the admin out even when the revoke call fails", async () => {
    // Leaving someone signed in because the network blinked is the worse of the
    // two failures — the local session is the one in front of them.
    vi.spyOn(authService, "logout").mockRejectedValue(new Error("offline"));

    const user = userEvent.setup();
    await renderRoute("/admin/dashboard");

    await openUserMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: /log out/i }));

    await waitFor(() => expect(useAuthStore.getState().token).toBeNull());
  });
});

describe("navbar page title", () => {
  it.each([
    ["/admin/users", "Users"],
    ["/admin/transactions/refunds", "Refunds"],
    ["/admin/reports", "Reports"],
    ["/admin/flash-sales", "Flash Sale"],
  ])("names %s rather than calling it the dashboard", async (path, title) => {
    // Only /admin/financial and /admin/integration were ever mapped, so every
    // other screen announced itself as "Dashboard" — including in the browser
    // tab and to screen readers.
    await renderRoute(path);

    expect(await screen.findByText(title, { selector: "[data-slot='breadcrumb-page']" })).toBeInTheDocument();
  });

  it("still says Dashboard on the dashboard", async () => {
    await renderRoute("/admin/dashboard");

    expect(await screen.findByText("Dashboard", { selector: "[data-slot='breadcrumb-page']" })).toBeInTheDocument();
  });
});
