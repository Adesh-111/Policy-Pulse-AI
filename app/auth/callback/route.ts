import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safePath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

function isUuid(value: string | null): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const invitedOrganizationId = url.searchParams.get("invite_org");
      if (invitedOrganizationId !== null) {
        if (!isUuid(invitedOrganizationId)) {
          await supabase.auth.signOut();
          const invalidInviteUrl = new URL("/login", url.origin);
          invalidInviteUrl.searchParams.set("error", "The invitation is invalid or has expired.");
          return NextResponse.redirect(invalidInviteUrl);
        }
        const { error: acceptanceError } = await supabase.rpc(
          "accept_current_user_invitation",
          { p_organization_id: invitedOrganizationId },
        );
        if (acceptanceError) {
          await supabase.auth.signOut();
          const invalidInviteUrl = new URL("/login", url.origin);
          invalidInviteUrl.searchParams.set("error", "The invitation is invalid or has expired.");
          return NextResponse.redirect(invalidInviteUrl);
        }
      }
      return NextResponse.redirect(
        new URL(safePath(url.searchParams.get("next")), url.origin),
      );
    }
  }
  const errorUrl = new URL("/login", url.origin);
  errorUrl.searchParams.set("error", "The authentication link is invalid or has expired.");
  return NextResponse.redirect(errorUrl);
}
