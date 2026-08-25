import type { Metadata } from "next";
import { FindingExplorer } from "@/components/operations/finding-explorer";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Risk dashboard" };
export default function RisksPage() { return <div className="space-y-7"><PageHeader eyebrow="Compliance exposure" title="Risk dashboard" description="Prioritize evidence-backed implementation risk by severity, department, urgency, and confidence." /><FindingExplorer mode="risks" /></div>; }
