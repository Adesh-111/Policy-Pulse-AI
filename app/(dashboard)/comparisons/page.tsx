import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { ComparisonList } from "@/components/comparisons/comparison-list";
import { ButtonLink, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Comparisons" };
export default function ComparisonsPage() { return <div className="space-y-7"><PageHeader eyebrow="Version intelligence" title="Policy comparisons" description="Track evidence-grounded analyses and resume any workflow that is processing, revising, or waiting for approval." actions={<ButtonLink href="/comparisons/new"><Plus className="size-4" /> New comparison</ButtonLink>} /><ComparisonList /></div>; }
