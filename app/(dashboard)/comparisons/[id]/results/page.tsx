import type { Metadata } from "next";
import { ComparisonResults } from "@/components/comparisons/comparison-results";
import { ButtonLink, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Comparison results" };
export default async function ComparisonResultsPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <div className="space-y-7"><PageHeader eyebrow="Cited analysis" title="Comparison results" description="Review supported changes, conflicts, impact, risk, planned actions, evidence, and the quality reviewer’s assessment." actions={<ButtonLink href="/comparisons" variant="secondary">All comparisons</ButtonLink>} /><ComparisonResults id={id} /></div>; }
