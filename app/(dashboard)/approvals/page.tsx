import type { Metadata } from "next";
import { ApprovalQueue } from "@/components/operations/approval-queue";
import { PageHeader } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Approval queue" };
export default async function ApprovalsPage() { const session = await requirePageSession(["administrator", "policy_manager", "auditor"]); return <div className="space-y-7"><PageHeader eyebrow="Human in the loop" title="Approval queue" description="Inspect high-risk findings, citations, and proposed actions before approving, rejecting, or requesting a revision." /><ApprovalQueue role={session.role} /></div>; }
