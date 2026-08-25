"use client";

import { GitCompareArrows, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { arrayValue, boolValue, firstString, formatDate, idOf, relatedDocumentTitle, type ApiRecord } from "@/components/api";
import { useApi } from "@/components/hooks/use-api";
import { Badge, ButtonLink, EmptyState, ErrorState, LoadingState, SeedLabel, statusTone } from "@/components/ui";

export function ComparisonList() {
  const { data, loading, error, refresh } = useApi("/api/v1/comparisons");
  const [query, setQuery] = useState("");
  const comparisons = arrayValue<ApiRecord>(data, ["comparisons"]);
  const visible = useMemo(() => comparisons.filter((item) => [
    firstString(item, ["title"], ""),
    firstString(item, ["status"], ""),
    relatedDocumentTitle(item, "old", ""),
    relatedDocumentTitle(item, "new", ""),
  ].join(" ").toLowerCase().includes(query.toLowerCase())), [comparisons, query]);
  if (loading && !data) return <div className="rounded-2xl border bg-white"><LoadingState label="Loading comparisons…" rows={5} /></div>;
  if (error && !data) return <div className="rounded-2xl border bg-white"><ErrorState message={error} onRetry={refresh} /></div>;
  if (!comparisons.length) return <div className="rounded-2xl border bg-white"><EmptyState icon={GitCompareArrows} title="No policy comparisons yet" description="Select an older and newer indexed policy version to begin a resumable, evidence-grounded analysis." action={<ButtonLink href="/comparisons/new"><Plus className="size-4" /> New comparison</ButtonLink>} /></div>;
  return <div className="space-y-4"><label className="relative block rounded-2xl border bg-white p-4"><span className="sr-only">Search comparisons</span><Search className="absolute left-7 top-7 size-4 text-[#84908a]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border bg-[#fafbf9] pl-10 pr-3 text-xs outline-none focus:border-[#0d684d]" placeholder="Search comparisons…" /></label><div className="grid gap-4 lg:grid-cols-2">{visible.map((item) => { const id = idOf(item); const status = firstString(item, ["status"], "pending"); const complete = ["complete", "completed", "approved"].includes(status.toLowerCase()); return <a href={`/comparisons/${id}/${complete ? "results" : "progress"}`} key={id} className="group rounded-2xl border bg-white p-5 transition hover:border-[#bac7c0] hover:shadow-sm"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#eaf4ef] text-[#0d684d]"><GitCompareArrows className="size-[18px]" /></span><div className="flex items-center gap-2"><SeedLabel seed={boolValue(item.is_seed)} /><Badge tone={statusTone(status)}>{status.replaceAll("_", " ")}</Badge></div></div><h2 className="mt-4 text-sm font-semibold text-[#26342f] group-hover:text-[#0d684d]">{firstString(item, ["title", "name"], "Policy comparison")}</h2><div className="mt-4 grid gap-2 rounded-xl bg-[#f7f9f7] p-3 text-xs text-[#66736d]"><p><span className="font-semibold text-[#3c4a44]">Older:</span> {relatedDocumentTitle(item, "old")}</p><p><span className="font-semibold text-[#3c4a44]">Newer:</span> {relatedDocumentTitle(item, "new")}</p></div><p className="mt-4 text-[11px] text-[#84908a]">Created {formatDate(item.created_at, true)}</p></a>; })}</div>{visible.length === 0 && <div className="rounded-2xl border bg-white"><EmptyState compact icon={Search} title="No comparisons match" description="Try a different policy title or status." /></div>}</div>;
}
