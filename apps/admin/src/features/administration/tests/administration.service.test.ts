import { describe, it, expect, vi, beforeEach } from "vitest";

import { api } from "@/lib/axios";
import { envelope } from "@/test/apiEnvelope";
import { usersService } from "../services/administration.service";

vi.mock("@/lib/axios", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const userRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  role_id: 2,
  role: "member",
  name: "Randy Galang",
  username: null,
  email: "randy@example.com",
  phone: "628",
  avatar_url: null,
  balance: 15000,
  point: 120,
  locale: "id",
  status: "active",
  email_verified_at: null,
  created_at: "2026-07-01",
  ...overrides,
});

describe("usersService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adjustBalance requires a reason and posts to the audited endpoint", async () => {
    vi.mocked(api.post).mockResolvedValue(envelope(userRow({ balance: 65000 })));

    await expect(usersService.adjustBalance("1", { amount: 5000, direction: "credit", reason: "  " })).rejects.toThrow(
      "A reason is required",
    );

    const result = await usersService.adjustBalance("1", {
      amount: 50000,
      direction: "credit",
      reason: "compensation",
    });

    expect(api.post).toHaveBeenCalledWith("/v1/users/1/balance-adjustments", {
      amount: 50000,
      direction: "credit",
      reason: "compensation",
    });
    expect(result.balance).toBe(65000);
  });

  it("setStatus posts the new standing and maps it back", async () => {
    vi.mocked(api.post).mockResolvedValue(envelope(userRow({ status: "banned" })));

    const result = await usersService.setStatus("1", "banned");

    expect(api.post).toHaveBeenCalledWith("/v1/users/1/status", { status: "banned" });
    expect(result.status).toBe("banned");
  });

  it("defaults status to active when the API omits it", async () => {
    vi.mocked(api.post).mockResolvedValue(envelope(userRow({ status: undefined })));

    const result = await usersService.setStatus("1", "active");

    expect(result.status).toBe("active");
  });
});
