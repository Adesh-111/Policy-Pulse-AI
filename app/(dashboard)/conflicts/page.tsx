import type { Metadata } from "next";
import { FindingExplorer } from "@/components/operations/finding-explorer";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Conflict explorer" };
export default function ConflictsPage() { return <div className="space-y-7"><PageHeader eyebrow="Cross-policy analysis" title="Conflict explorer" description="Inspect contradictory requirements, their affected departments, confidence, and the passages that support each finding." /><FindingExplorer mode="conflicts" /></div>; }
