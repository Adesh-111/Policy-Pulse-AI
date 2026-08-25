"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, FileText, GitCompareArrows, ListChecks, Plus, ShieldAlert } from "lucide-react";
import { apiRequest, arrayValue, boolValue, firstString, formatDate, idOf, type ApiRecord } from "@/components/api";
import { Badge, ButtonLink, EmptyState, ErrorState, InlineLink, LoadingState, SectionCard, SeedLabel, StatCard, statusTone } from "@/components/ui";

type Snapshot = { documents: ApiRecord[]; comparisons: ApiRecord[]; approvals: ApiRecord[]; plans: ApiRecord[] };

export function DashboardOverview() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      apiRequest("/api/v1/documents"),
      apiRequest("/api/v1/comparisons"),
      apiRequest("/api/v1/approvals"),
      apiRequest("/api/v1/action-plans"),
    ]).then(([documents, comparisons, approvals, plans]) => {
      const requiredFailure = [documents, comparisons, plans].find((result) => result.status === "rejected");
      if (requiredFailure?.status === "rejected") throw requiredFailure.reason;
      if (documents.status !== "fulfilled" || comparisons.status !== "fulfilled" || plans.status !== "fulfilled") throw new Error("The workspace summary is unavailable.");
      if (active) setSnapshot({ documents: arrayValue(documents.value, ["documents"]), comparisons: arrayValue(comparisons.value, ["comparisons"]), approvals: approvals.status === "fulfilled" ? arrayValue(approvals.value, ["approvals", "requests"]) : [], plans: arrayValue(plans.value, ["action_plans", "plans"]) });
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "The workspace summary is unavailable."); });
    return () => { active = false; };
  }, [revision]);

  if (error && !snapshot) return <SectionCard><ErrorState message={error} onRetry={() => { setError(""); setRevision((value) => value + 1); }} /></SectionCard>;
  if (!snapshot) return <SectionCard><LoadingState label="Assembling your workspace…" rows={5} /></SectionCard>;

  const pendingApprovals = snapshot.approvals.filter((item) => ["pending", "awaiting_approval", "in_review"].includes(firstString(item, ["status"], "").toLowerCase()));
  const openActions = snapshot.plans.filter((item) => !["complete", "completed", "closed"].includes(firstString(item, ["status"], "").toLowerCase()));
  const activeComparisons = snapshot.comparisons.filter((item) => ["running", "processing", "awaiting_approval", "pending"].includes(firstString(item, ["status"], "").toLowerCase()));
  const recentComparisons = snapshot.comparisons.slice(0, 5);
  const recentDocuments = snapshot.documents.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Policies in library" value={snapshot.documents.length} detail="Authorized documents and versions" icon={FileText} />
        <StatCard label="Active analyses" value={activeComparisons.length} detail="Running or waiting for review" icon={GitCompareArrows} tone="blue" />
        <StatCard label="Awaiting approval" value={pendingApprovals.length} detail="High-risk items needing judgment" icon={ClipboardCheck} tone="amber" />
        <StatCard label="Open action plans" value={openActions.length} detail="Plans not yet marked complete" icon={ListChecks} tone="rose" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <SectionCard title="Recent comparisons" description="Current and recently completed policy analyses." action={<InlineLink href="/comparisons">View all</InlineLink>}>
          {recentComparisons.length === 0 ? <EmptyState compact icon={GitCompareArrows} title="No comparisons yet" description="Choose two indexed policy versions to start a checkpointed analysis." action={<ButtonLink href="/comparisons/new"><Plus className="size-4" /> New comparison</ButtonLink>} /> : <div className="divide-y divide-[#edf0ee]">{recentComparisons.map((item) => { const id = idOf(item); const status = firstString(item, ["status"], "Pending"); return <a key={id} href={`/comparisons/${id}/${["completed", "complete", "approved"].includes(status.toLowerCase()) ? "results" : "progress"}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-[#fafbf9] sm:px-6"><span className="grid size-10 place-items-center rounded-xl bg-[#edf4f0] text-[#0d684d]"><GitCompareArrows className="size-[18px]" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-[#26342f]">{firstString(item, ["title", "name"], "Policy comparison")}</p><SeedLabel seed={boolValue(item.is_seed)} /></div><p className="mt-1 text-xs text-[#7a8580]">Updated {formatDate(item.updated_at ?? item.created_at, true)}</p></div><Badge tone={statusTone(status)}>{status.replaceAll("_", " ")}</Badge></a>; })}</div>}
        </SectionCard>
        <SectionCard title="Review attention" description="Items that may need a person to act.">
          <div className="space-y-3 p-5">
            <a href="/approvals" className="flex items-center gap-3 rounded-xl border border-[#e3e8e5] p-3.5 hover:border-amber-200 hover:bg-amber-50/40"><span className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-700"><ShieldAlert className="size-4" /></span><div className="flex-1"><p className="text-xs font-semibold">Approval queue</p><p className="mt-1 text-[11px] text-[#78837e]">{pendingApprovals.length} pending request{pendingApprovals.length === 1 ? "" : "s"}</p></div><span className="text-lg font-semibold text-[#283630]">{pendingApprovals.length}</span></a>
            <a href="/action-plans" className="flex items-center gap-3 rounded-xl border border-[#e3e8e5] p-3.5 hover:border-emerald-200 hover:bg-emerald-50/40"><span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><CheckCircle2 className="size-4" /></span><div className="flex-1"><p className="text-xs font-semibold">Assigned actions</p><p className="mt-1 text-[11px] text-[#78837e]">Open implementation work</p></div><span className="text-lg font-semibold text-[#283630]">{openActions.length}</span></a>
          </div>
        </SectionCard>
      </div>
      <SectionCard title="Recently added policies" description="Latest documents visible to your role." action={<InlineLink href="/policies">Open library</InlineLink>}>
        {recentDocuments.length === 0 ? <EmptyState compact icon={FileText} title="Your policy library is empty" description="Upload a PDF, DOCX, TXT, or Markdown policy to begin secure processing and indexing." action={<ButtonLink href="/policies/upload">Upload a policy</ButtonLink>} /> : <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">{recentDocuments.map((document) => { const id = idOf(document); const status = firstString(document, ["processing_status", "status"], "Uploaded"); return <a href={`/policies/${id}`} key={id} className="rounded-xl border border-[#e2e7e4] p-4 transition hover:border-[#bfcac4] hover:bg-[#fbfcfa]"><div className="flex items-start justify-between gap-3"><FileText className="size-5 text-[#0d684d]" /><Badge tone={statusTone(status)}>{status.replaceAll("_", " ")}</Badge></div><p className="mt-4 truncate text-sm font-semibold">{firstString(document, ["title", "name"], "Untitled policy")}</p><p className="mt-1.5 text-xs text-[#7b8681]">Version {firstString(document, ["version", "version_label"], "—")} · {firstString(document, ["category"], "Uncategorized")}</p><div className="mt-3"><SeedLabel seed={boolValue(document.is_seed)} /></div></a>; })}</div>}
      </SectionCard>
    </div>
  );
}
