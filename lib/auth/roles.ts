export const roles = [
  "administrator",
  "policy_manager",
  "department_user",
  "auditor",
] as const;

export type AppRole = (typeof roles)[number];

export const roleLabels: Record<AppRole, string> = {
  administrator: "Administrator",
  policy_manager: "Policy Manager",
  department_user: "Department User",
  auditor: "Auditor",
};

export const permissions = {
  manageUsers: ["administrator"],
  manageDepartments: ["administrator"],
  viewUsage: ["administrator"],
  configureSystem: ["administrator"],
  uploadPolicy: ["administrator", "policy_manager"],
  comparePolicies: ["administrator", "policy_manager"],
  reviewFindings: ["administrator", "policy_manager", "auditor"],
  decideApproval: ["administrator", "policy_manager"],
  updateActions: ["administrator", "policy_manager", "department_user"],
  useAssistant: [
    "administrator",
    "policy_manager",
    "department_user",
    "auditor",
  ],
  viewAudit: ["administrator", "auditor"],
} satisfies Record<string, readonly AppRole[]>;

export function hasRole(
  role: AppRole,
  allowed: readonly AppRole[],
): boolean {
  return allowed.includes(role);
}
