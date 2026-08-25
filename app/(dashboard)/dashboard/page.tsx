import type { Metadata } from "next";
import { Plus, Sparkles } from "lucide-react";
import { DashboardOverview } from "@/components/dashboard/overview";
import { ButtonLink, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <div className="space-y-7"><PageHeader eyebrow="Workspace overview" title="Good policy work starts with the evidence" description="Track current analyses, review obligations, and implementation work across your authorized organization scope." actions={<><ButtonLink href="/assistant" variant="secondary"><Sparkles className="size-4" /> Ask assistant</ButtonLink><ButtonLink href="/comparisons/new"><Plus className="size-4" /> New comparison</ButtonLink></>} />{query.notice === "forbidden" && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">Your role does not have access to that area.</div>}<DashboardOverview /></div>;
}
