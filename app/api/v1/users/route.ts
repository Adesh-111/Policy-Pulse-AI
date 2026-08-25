import { z } from "zod";
import { apiRoute, json } from "@/lib/api/route";
import { getServerEnv } from "@/lib/config/env";
import { writeAuditEvent } from "@/lib/audit/log";
import { ApiError } from "@/lib/security/errors";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const inviteSchema = z
  .object({
    email: z.email(),
    fullName: z.string().trim().min(2).max(160),
    role: z.enum([
      "administrator",
      "policy_manager",
      "department_user",
      "auditor",
    ]),
    departmentIds: z.array(z.uuid()).max(50).default([]),
  })
  .superRefine((invitation, context) => {
    if (invitation.role === "department_user" && invitation.departmentIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["departmentIds"],
        message: "Department users require at least one department.",
      });
    }
  });

export const GET = apiRoute(
  { roles: ["administrator"] },
  async ({ session }) => {
    const supabase = await createServerSupabaseClient();
    const { data: memberships, error } = await supabase
      .from("memberships")
      .select(
        "id,user_id,role,status,department_id,created_at,departments:departments!memberships_department_tenant_fk(id,name,code),profile_departments(department_id,departments(id,name,code))",
      )
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const userIds = (memberships ?? []).map((membership) => membership.user_id);
    const { data: profiles, error: profileError } = userIds.length
      ? await supabase
          .from("profiles")
          .select("id,full_name,avatar_url,is_active")
          .in("id", userIds)
      : { data: [], error: null };
    if (profileError) throw profileError;
    const profilesById = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile]),
    );
    return json({
      data: (memberships ?? []).map((membership) => ({
        ...membership,
        profiles: profilesById.get(membership.user_id) ?? null,
      })),
    });
  },
);

export const POST = apiRoute(
  { roles: ["administrator"], body: inviteSchema },
  async ({ body, session, requestId }) => {
    const admin = createAdminSupabaseClient();
    if (body.departmentIds.length) {
      const { count, error: departmentError } = await admin
        .from("departments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", session.organizationId)
        .eq("is_active", true)
        .in("id", body.departmentIds);
      if (departmentError) throw departmentError;
      if (count !== new Set(body.departmentIds).size) {
        throw new ApiError(
          "One or more invitation departments are invalid or inactive.",
          400,
          "INVALID_DEPARTMENT_SCOPE",
        );
      }
    }
    const redirectUrl = new URL(
      "/auth/callback?next=/reset-password",
      getServerEnv().NEXT_PUBLIC_SITE_URL,
    );
    redirectUrl.searchParams.set("invite_org", session.organizationId);
    const redirectTo = redirectUrl.toString();
    const { data: invitation, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(body.email, {
        redirectTo,
        data: {
          full_name: body.fullName,
          invited_to_organization_id: session.organizationId,
        },
      });
    if (inviteError) throw inviteError;
    const user = invitation.user;
    let membership: Record<string, unknown>;
    try {
      const { error: profileError } = await admin.from("profiles").upsert({
        id: user.id,
        default_organization_id: session.organizationId,
        department_id: body.departmentIds[0] ?? null,
        full_name: body.fullName,
      });
      if (profileError) throw profileError;
      const { data: createdMembership, error: membershipError } = await admin
        .from("memberships")
        .upsert(
          {
            organization_id: session.organizationId,
            user_id: user.id,
            role: body.role,
            department_id: body.departmentIds[0] ?? null,
            status: "invited",
            invited_by: session.user.id,
            invited_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,user_id" },
        )
        .select()
        .single();
      if (membershipError) throw membershipError;
      membership = createdMembership;
      if (body.departmentIds.length > 0) {
        const { error } = await admin.from("profile_departments").upsert(
          body.departmentIds.map((departmentId) => ({
            organization_id: session.organizationId,
            user_id: user.id,
            department_id: departmentId,
            assigned_by: session.user.id,
          })),
          { onConflict: "user_id,department_id" },
        );
        if (error) throw error;
      }
    } catch (error) {
      // The Auth invitation is the only cross-service write. Compensate if the
      // tenant rows cannot be committed so no unusable orphan account remains.
      await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
      throw error;
    }
    await writeAuditEvent({
      organizationId: session.organizationId,
      actorId: session.user.id,
      action: "membership.invited",
      targetType: "membership",
      targetId: String(membership.id),
      requestId,
      after: { userId: user.id, role: body.role, departments: body.departmentIds },
    });
    return json(
      { data: { membership, user: { id: user.id, email: user.email } } },
      { status: 201 },
    );
  },
);
