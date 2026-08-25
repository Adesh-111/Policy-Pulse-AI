import type { Metadata } from "next";
import { ComparisonProgress } from "@/components/comparisons/comparison-progress";
import { ButtonLink, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Analysis progress" };
export default async function ComparisonProgressPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <div className="space-y-7"><PageHeader eyebrow="Resumable multi-agent analysis" title="Analysis in progress" description="Follow the persisted workflow from validation through quality review, approval, and final report." actions={<ButtonLink href="/comparisons" variant="secondary">All comparisons</ButtonLink>} /><ComparisonProgress comparisonId={id} /></div>; }
