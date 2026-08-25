"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = { error?: string; success?: string };

function value(data: FormData, key: string) {
  const item = data.get(key);
  return typeof item === "string" ? item.trim() : "";
}

function safeNextPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") ? path : "/dashboard";
}

export async function loginAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  if (!email || !password) return { error: "Enter both your email address and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "We couldn’t sign you in with those credentials." };
  redirect(safeNextPath(value(formData, "next")));
}

export async function registerAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const fullName = value(formData, "fullName");
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const organizationName = value(formData, "organizationName");
  if (!fullName || !email || !organizationName) return { error: "Complete all required fields." };
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
      data: { full_name: fullName, organization_name: organizationName },
    },
  });
  if (error) return { error: error.message.includes("registered") ? "An account already exists for this email." : "We couldn’t create the account. Please try again." };
  if (data.session) redirect("/dashboard");
  return { success: "Check your inbox to confirm your email, then sign in." };
}

export async function forgotPasswordAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = value(formData, "email").toLowerCase();
  if (!email) return { error: "Enter your account email address." };
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  if (error) return { error: "We couldn’t send a reset link. Wait a moment and try again." };
  return { success: "If an account exists for that email, a secure reset link is on its way." };
}

export async function resetPasswordAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };
  if (password !== confirmPassword) return { error: "The passwords do not match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "This reset link may have expired. Request a new one and try again." };
  return { success: "Your password has been updated. You can now sign in." };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
