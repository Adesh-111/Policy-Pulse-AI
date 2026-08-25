import type { Metadata } from "next";
import { AuditLog } from "@/components/admin/audit-log";
import { PageHeader } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Audit logs" };
export default async function AuditPage() { await requirePageSession(["administrator", "auditor"]); return <div className="space-y-7"><PageHeader eyebrow="Governance oversight" title="Audit logs" description="Review attributable, append-only records for security-sensitive policy, workflow, approval, action, and administration events." /><AuditLog /></div>; }
