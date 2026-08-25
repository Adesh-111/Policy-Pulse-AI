import { describe, expect, it } from "vitest";

import { hasRole, permissions, roles } from "@/lib/auth/roles";

describe("authentication and authorization role matrix", () => {
  it("defines only the four authoritative application roles", () => {
    expect(roles).toEqual([
      "administrator",
      "policy_manager",
      "department_user",
      "auditor",
    ]);
  });

  it("keeps administration and approval mutations least-privileged", () => {
    expect(hasRole("administrator", permissions.manageUsers)).toBe(true);
    expect(hasRole("policy_manager", permissions.manageUsers)).toBe(false);
    expect(hasRole("auditor", permissions.decideApproval)).toBe(false);
    expect(hasRole("department_user", permissions.decideApproval)).toBe(false);
    expect(hasRole("policy_manager", permissions.decideApproval)).toBe(true);
  });

  it("allows every signed-in role to use grounded assistant access", () => {
    for (const role of roles) expect(hasRole(role, permissions.useAssistant)).toBe(true);
    expect(permissions.viewAudit).toEqual(["administrator", "auditor"]);
    expect(permissions.viewUsage).toEqual(["administrator"]);
  });
});
