import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasRole, roles, type AppRole } from "@/lib/auth/roles";

export interface SessionContext {
  user: User;
  organizationId: string;
  role: AppRole;
  departmentIds: string[];
}

export class AuthenticationError extends Error {
  readonly status = 401;
}

export class AuthorizationError extends Error {
  readonly status = 403;
}

function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && roles.includes(value as AppRole);
}

export async function getSessionContext(): Promise<SessionContext | null> {
  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership ||
    !isAppRole(membership.role) ||
    typeof membership.organization_id !== "string"
  ) {
    return null;
  }

  const { data: departmentRows } = await supabase
    .from("profile_departments")
    .select("department_id")
    .eq("user_id", user.id)
    .eq("organization_id", membership.organization_id);

  return {
    user,
    organizationId: membership.organization_id,
    role: membership.role,
    departmentIds: (departmentRows ?? [])
      .map((row) => row.department_id)
      .filter((id): id is string => typeof id === "string"),
  };
}

export async function requireSession(
  allowedRoles?: readonly AppRole[],
): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) throw new AuthenticationError("Authentication required.");
  if (allowedRoles && !hasRole(session.role, allowedRoles)) {
    throw new AuthorizationError("You do not have permission for this action.");
  }
  return session;
}

export async function requirePageSession(
  allowedRoles?: readonly AppRole[],
): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (allowedRoles && !hasRole(session.role, allowedRoles)) {
    redirect("/dashboard?notice=forbidden");
  }
  return session;
}
