import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const next = typeof query.next === "string" ? query.next : "/dashboard";
  const error = typeof query.error === "string" ? query.error : undefined;
  return <AuthForm mode="login" next={next} externalError={error} />;
}
