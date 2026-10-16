import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { makeUser, renderRoute, screen } from "@/test/test-utils";
import { useAuthStore } from "@/store/useAuthStore";
import { websiteSubscriptionService } from "../services/websiteSubscription.service";

/**
 * The sidebar footer card. It is mounted on every admin route, so the states
 * that matter are the ones where it must stay quiet rather than render "—".
 */
beforeEach(() => {
  useAuthStore.setState({ token: "test-token", user: makeUser(), permissions: ["*"] });
});

afterEach(() => {
  useAuthStore.setState({ token: null, user: null, permissions: [] });
  vi.restoreAllMocks();
});

describe("WebsiteSubscriptionCard", () => {
  it("shows the remaining days and links out to the payment panel", async () => {
    await renderRoute("/admin/dashboard");

    // The CTA names the action, not kita's brand: this card sits in the
    // client's own panel, and the service label beside it already carries the
    // site's name.
    const link = await screen.findByRole("link", { name: "Go Check" });

    expect(link).toHaveAttribute("href", "https://pay.example.test/app/payment-admin/services/1/checkout");
    // The route is behind a login over there, so it must open in a new tab
    // rather than navigating the admin out of their own panel.
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText("9 days remaining")).toBeInTheDocument();
  });

  it("shows the service name and the date it is active until", async () => {
    vi.spyOn(websiteSubscriptionService, "get").mockResolvedValue({
      status: "active",
      service: { id: 1, code: "uxiolabs", name: "UxioLabs Services" },
      ends_at: "2026-09-14T00:00:00.000Z",
      days_remaining: 300,
      checkout_url: "https://pay.example.test/app/payment-admin/services/1/checkout",
    });

    await renderRoute("/admin/dashboard");

    expect(await screen.findByText("UxioLabs Services")).toBeInTheDocument();
    expect(screen.getByText("Active until 14 Sep 2026")).toBeInTheDocument();
    // The per-service list and its Detail dialog are gone from the footer.
    expect(screen.queryByRole("button", { name: "Detail" })).not.toBeInTheDocument();
  });

  it("prints no period for a lifetime licence", async () => {
    vi.spyOn(websiteSubscriptionService, "get").mockResolvedValue({
      status: "active",
      service: { id: 1, code: "uxiolabs", name: "TopupGame by Uxiolabs" },
      ends_at: null,
      days_remaining: null,
      lifetime: true,
      services: [
        {
          service_code: "uxiolabs",
          service_name: "TopupGame by Uxiolabs",
          billing_mode: "one_time",
          duration_days: 365,
          governs_licence: true,
          lifetime: true,
          active_until: null,
        },
      ],
      checkout_url: "https://pay.example.test/app/payment-admin/services/1/checkout",
    });

    await renderRoute("/admin/dashboard");

    // A one-time licence says "Lifetime" and never an "Active until" period
    // that would promise a renewal that never comes.
    expect(await screen.findByText("Lifetime")).toBeInTheDocument();
    expect(screen.queryByText(/Active until/)).not.toBeInTheDocument();
  });

  it("still offers the link when the site has never subscribed", async () => {
    // The moment the CTA matters most.
    vi.spyOn(websiteSubscriptionService, "get").mockResolvedValue({
      status: "none",
      service: { id: 1, code: "uxiolabs", name: "Website Topup" },
      ends_at: null,
      days_remaining: null,
      checkout_url: "https://pay.example.test/app/payment-admin/services/1/checkout",
    });

    await renderRoute("/admin/dashboard");

    expect(await screen.findByText("Not subscribed")).toBeInTheDocument();
  });

  it("still shows the card, with the button disabled, when billing is not configured", async () => {
    // No default merchant or no matching service. The card stays visible so the
    // footer does not look broken, but there is nowhere to send the client.
    vi.spyOn(websiteSubscriptionService, "get").mockResolvedValue({
      status: "unconfigured",
      service: null,
      ends_at: null,
      days_remaining: null,
      checkout_url: null,
    });

    await renderRoute("/admin/dashboard");

    expect(await screen.findByText("Website subscription")).toBeInTheDocument();
    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go Check" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Go Check" })).not.toBeInTheDocument();
  });

  it("says the site is switched off rather than counting down to a date", async () => {
    // A suspended site is already refusing customers. Rendering "300 hari
    // tersisa" here would make the one screen that should explain the outage
    // deny it instead.
    vi.spyOn(websiteSubscriptionService, "get").mockResolvedValue({
      status: "suspended",
      service: { id: 1, code: "uxiolabs", name: "TopupGame by Uxiolabs" },
      ends_at: "2027-01-01T00:00:00+08:00",
      days_remaining: 300,
      checkout_url: "https://pay.example.test/app/payment-admin/services/1/checkout",
      is_serving: false,
      suspend_reason: "Belum bayar",
    });

    await renderRoute("/admin/dashboard");

    expect(await screen.findByText("Belum bayar")).toBeInTheDocument();
    expect(screen.queryByText("300 hari tersisa")).not.toBeInTheDocument();
  });
});
