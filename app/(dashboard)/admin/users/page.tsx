import type { Metadata } from "next";
import { UserManagement } from "@/components/admin/management";
import { PageHeader } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "User management" };
export default async function UsersPage() { await requirePageSession(["administrator"]); return <div className="space-y-7"><PageHeader eyebrow="Administrator access control" title="User management" description="Invite members and manage organization roles, department scope, and membership status." /><UserManagement /></div>; }
