import type { Metadata } from "next";
import { UsageDashboard } from "@/components/admin/usage-dashboard";
import { PageHeader } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "OpenAI usage" };
export default async function UsagePage() { await requirePageSession(["administrator"]); return <div className="space-y-7"><PageHeader eyebrow="Administrator telemetry" title="OpenAI usage and cost" description="Monitor every recorded model operation by model, workflow, token volume, estimated cost, latency, status, and timestamp." /><UsageDashboard /></div>; }
