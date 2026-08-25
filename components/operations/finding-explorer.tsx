"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Filter, Quote, Search, ShieldAlert } from "lucide-react";
import { apiRequest, arrayValue, citationDisplay, citationRecords, firstString, idOf, type ApiRecord } from "@/components/api";
import { Badge, EmptyState, ErrorState, LoadingState, SeedLabel, statusTone } from "@/components/ui";

export function FindingExplorer({ mode }: { mode: "conflicts" | "risks" }) {
  const [items, setItems] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  useEffect(() => {
    let active = true;
    apiRequest("/api/v1/comparisons").then(async (payload) => {
      const comparisons = arrayValue<ApiRecord>(payload, ["comparisons"]).slice(0, 50);
      const collections = await Promise.all(comparisons.map(async (comparison) => {
        const id = idOf(comparison);
        if (!id) return [];
        const findings = await apiRequest(`/api/v1/comparisons/${encodeURIComponent(id)}/${mode}`);
        return arrayValue<ApiRecord>(findings).map((finding) => ({ ...finding, comparison_title: firstString(comparison, ["title"], "Policy comparison") }));
      }));
      if (active) { setItems(collections.flat()); setError(""); }
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : `The ${mode} could not be loaded.`); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, revision]);
  const visible = useMemo(() => items.filter((item) => {
    const haystack = ["title", "summary", "description", "explanation", "department", "department_name"].map((key) => firstString(item, [key], "")).join(" ").toLowerCase();
    const level = firstString(item, ["risk_level", "severity", "status"], "").toLowerCase();
    return haystack.includes(query.toLowerCase()) && (severity === "all" || level === severity);
  }), [items, query, severity]);
  const Icon = mode === "conflicts" ? ShieldAlert : AlertTriangle;
  if (loading && !items.length) return <div className="rounded-2xl border bg-white"><LoadingState label={`Loading ${mode}…`} rows={6} /></div>;
  if (error && !items.length) return <div className="rounded-2xl border bg-white"><ErrorState message={error} onRetry={() => { setLoading(true); setRevision((value) => value + 1); }} /></div>;
  if (!items.length) return <div className="rounded-2xl border bg-white"><EmptyState icon={CheckCircle2} title={`No ${mode} are currently reported`} description={mode === "conflicts" ? "Cross-policy contradictions will appear here only when the analysis has enough supporting evidence." : "Risk assessments will appear after a comparison completes impact analysis and quality review."} /></div>;
  return <div className="space-y-4"><div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row"><label className="relative flex-1"><span className="sr-only">Search {mode}</span><Search className="absolute left-3.5 top-3 size-4 text-[#84908a]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border bg-[#fafbf9] pl-10 pr-3 text-xs outline-none focus:border-[#0d684d]" placeholder={`Search ${mode}, departments, or explanations…`} /></label><label className="relative"><Filter className="pointer-events-none absolute left-3.5 top-3 size-4 text-[#84908a]" /><span className="sr-only">Filter severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value)} className="h-10 min-w-44 appearance-none rounded-xl border bg-white pl-10 pr-7 text-xs"><option value="all">All risk levels</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label></div><div className="grid gap-4 xl:grid-cols-2">{visible.map((item, index) => { const level = firstString(item, ["risk_level", "severity"], "Unrated"); const citations = citationRecords(item); return <article key={idOf(item) || index} className="rounded-2xl border bg-white p-5"><div className="flex items-start justify-between gap-3"><span className={`grid size-10 place-items-center rounded-xl ${mode === "conflicts" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}><Icon className="size-[18px]" /></span><div className="flex flex-wrap justify-end gap-2"><SeedLabel seed={item.is_seed === true} /><Badge tone={statusTone(level)}>{level}</Badge></div></div><h2 className="mt-4 text-sm font-semibold leading-6">{firstString(item, ["title", "summary", "conflict_type"], mode === "conflicts" ? "Policy conflict" : "Risk assessment")}</h2><p className="mt-2 text-xs leading-6 text-[#68756f]">{firstString(item, ["explanation", "description", "rationale", "impact"], "No additional explanation was returned.")}</p><div className="mt-4 flex flex-wrap items-center gap-2">{firstString(item, ["department", "department_name"], "") && <Badge><Building2 className="mr-1 size-3" />{firstString(item, ["department", "department_name"], "")}</Badge>}{item.confidence != null && <Badge>Confidence {Math.round(Number(item.confidence) * (Number(item.confidence) <= 1 ? 100 : 1))}%</Badge>}</div>{citations.length > 0 && <details className="mt-4 rounded-xl border bg-[#fafbf9]"><summary className="flex list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold text-[#0d684d]"><Quote className="size-3.5" />View supporting evidence</summary><div className="space-y-3 border-t p-3">{citations.map((citation, citationIndex) => { const display = citationDisplay(citation); return display ? <div key={firstString(citation, ["chunkId", "chunk_id", "id"], String(citationIndex))}><p className="text-[11px] font-semibold">{display.documentTitle} · v{display.version}</p><p className="mt-1 text-[10px] text-[#7b8681]">{display.sectionHeading}{display.pageNumber ? ` · Page ${display.pageNumber}` : ""}</p><p className="mt-2 text-xs leading-5 text-[#5f6c66]">{display.evidenceSnippet}</p></div> : null; })}</div></details>}</article>; })}</div>{visible.length === 0 && <div className="rounded-2xl border bg-white"><EmptyState compact icon={Search} title="Nothing matches these filters" description="Adjust the search text or risk level." /></div>}</div>;
}
