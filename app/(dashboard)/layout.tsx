import { requirePageSession } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  const rawName = session.user.user_metadata?.full_name;
  const name = typeof rawName === "string" && rawName.trim() ? rawName : session.user.email?.split("@")[0] ?? "Workspace member";
  return <AppShell viewer={{ name, email: session.user.email ?? "", role: session.role }}>{children}</AppShell>;
}
