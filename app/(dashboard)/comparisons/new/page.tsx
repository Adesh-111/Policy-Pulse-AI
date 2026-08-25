import type { Metadata } from "next";
import { NewComparisonForm } from "@/components/comparisons/new-comparison-form";
import { PageHeader } from "@/components/ui";
import { requirePageSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New comparison" };
export default async function NewComparisonPage() { await requirePageSession(["administrator", "policy_manager"]); return <div className="space-y-7"><PageHeader eyebrow="New analysis" title="Compare policy versions" description="Choose the authoritative older and newer versions. Findings are generated only when retrieved evidence supports them." /><NewComparisonForm /></div>; }
