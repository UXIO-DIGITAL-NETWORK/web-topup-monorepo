import { describe, it, expect } from "vitest";

import { NAV_GROUPS, findNavLabelKey } from "../data/nav-groups.data";

describe("NAV_GROUPS", () => {
  it("orders the groups as the Figma sidebar does", () => {
    expect(NAV_GROUPS.map((group) => group.labelKey)).toEqual([
      "navGeneral",
      "navOrders",
      "navProductsServices",
      "navMarketing",
      "navAdministration",
    ]);
  });

  it("puts Website Settings under General", () => {
    const general = NAV_GROUPS.find((group) => group.labelKey === "navGeneral");

    expect(general?.items.map((item) => item.labelKey)).toContain("navSettings");
  });

  it("keeps Security reachable and resolves its title ahead of Settings", () => {
    expect(findNavLabelKey("/admin/settings/security")).toBe("navSecurity");
    expect(findNavLabelKey("/admin/settings")).toBe("navSettings");
  });
});
