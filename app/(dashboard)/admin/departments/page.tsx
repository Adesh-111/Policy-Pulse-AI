import type { Metadata } from "next";
import { DepartmentManagement } from "@/components/admin/management";
import { PageHeader } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Department management" };
export default async function DepartmentsPage() { await requirePageSession(["administrator"]); return <div className="space-y-7"><PageHeader eyebrow="Administrator scope" title="Department management" description="Maintain the organizational scopes used by policy access, retrieval filters, affected-department findings, and action ownership." /><DepartmentManagement /></div>; }
