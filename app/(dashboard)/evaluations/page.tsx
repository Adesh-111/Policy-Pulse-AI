import type { Metadata } from "next";
import { EvaluationDashboard } from "@/components/evaluations/evaluation-dashboard";
import { PageHeader } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Evaluation dashboard" };
export default async function EvaluationsPage() { const session = await requirePageSession(["administrator", "policy_manager", "auditor"]); return <div className="space-y-7"><PageHeader eyebrow="Measured quality" title="Evaluation dashboard" description="Compare ungrounded generation, grounded RAG, and the agentic self-reflective workflow across retrieval, answer quality, citations, accuracy, safety, latency, tokens, and cost." /><EvaluationDashboard role={session.role} /></div>; }
