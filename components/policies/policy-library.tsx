"use client";

import { useMemo, useState } from "react";
import { FileText, Filter, Search } from "lucide-react";
import { arrayValue, boolValue, departmentName, firstString, formatDate, idOf, type ApiRecord } from "@/components/api";
import { useApi } from "@/components/hooks/use-api";
import { Badge, ButtonLink, EmptyState, ErrorState, LoadingState, SeedLabel, statusTone } from "@/components/ui";

export function PolicyLibrary() {
  const { data, loading, error, refresh } = useApi("/api/v1/documents");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const documents = arrayValue<ApiRecord>(data, ["documents"]);
  const visible = useMemo(() => documents.filter((record) => {
    const haystack = ["title", "description", "category", "version"].map((key) => firstString(record, [key], "")).concat(departmentName(record, "")).join(" ").toLowerCase();
    const recordStatus = firstString(record, ["processing_status", "status"], "uploaded").toLowerCase();
    return haystack.includes(query.toLowerCase()) && (status === "all" || recordStatus === status);
  }), [documents, query, status]);

  if (loading && !data) return <div className="rounded-2xl border bg-white"><LoadingState label="Loading authorized policies…" rows={6} /></div>;
  if (error && !data) return <div className="rounded-2xl border bg-white"><ErrorState message={error} onRetry={refresh} /></div>;
  if (documents.length === 0) return <div className="rounded-2xl border bg-white"><EmptyState icon={FileText} title="No policies have been uploaded" description="Add an old or new policy version. It will be validated, stored privately, extracted, chunked, embedded, and indexed before comparison." action={<ButtonLink href="/policies/upload">Upload your first policy</ButtonLink>} /></div>;

  return <div className="space-y-4"><div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-center"><label className="relative flex-1"><span className="sr-only">Search policies</span><Search className="absolute left-3.5 top-3 size-4 text-[#84908a]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, category, version, or department…" className="h-10 w-full rounded-xl border border-[#dae1dd] bg-[#fafbf9] pl-10 pr-3 text-xs outline-none focus:border-[#0d684d] focus:ring-3 focus:ring-[#0d684d]/10" /></label><label className="relative"><span className="sr-only">Filter by processing status</span><Filter className="pointer-events-none absolute left-3.5 top-3 size-4 text-[#84908a]" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 min-w-48 appearance-none rounded-xl border border-[#dae1dd] bg-white pl-10 pr-8 text-xs font-medium outline-none focus:border-[#0d684d]"><option value="all">All processing states</option><option value="uploaded">Uploaded</option><option value="extracting">Extracting</option><option value="chunking">Chunking</option><option value="embedding">Embedding</option><option value="indexed">Indexed</option><option value="failed">Failed</option></select></label></div>
    <div className="overflow-hidden rounded-2xl border bg-white"><div className="hidden grid-cols-[minmax(240px,1.4fr)_minmax(140px,.6fr)_100px_120px_110px] gap-4 border-b bg-[#fafbf9] px-6 py-3 text-[10px] font-bold uppercase tracking-[0.13em] text-[#79847f] lg:grid"><span>Policy</span><span>Department</span><span>Version</span><span>Updated</span><span>Status</span></div>{visible.length === 0 ? <EmptyState compact icon={Search} title="No policies match these filters" description="Adjust the search or processing-state filter to broaden the library view." /> : <div className="divide-y divide-[#edf0ee]">{visible.map((record) => { const id = idOf(record); const recordStatus = firstString(record, ["processing_status", "status"], "Uploaded"); return <a href={`/policies/${id}`} key={id} className="grid gap-3 px-5 py-4 transition hover:bg-[#fafbf9] lg:grid-cols-[minmax(240px,1.4fr)_minmax(140px,.6fr)_100px_120px_110px] lg:items-center lg:gap-4 lg:px-6"><div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf4f0] text-[#0d684d]"><FileText className="size-[18px]" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-[#26342f]">{firstString(record, ["title", "name"], "Untitled policy")}</p><SeedLabel seed={boolValue(record.is_seed)} /></div><p className="mt-1 truncate text-xs text-[#7a8580]">{firstString(record, ["category"], "Uncategorized")} · {firstString(record, ["document_type", "designation"], "Policy")}</p></div></div><p className="text-xs text-[#5e6b65]"><span className="font-semibold lg:hidden">Department: </span>{departmentName(record)}</p><p className="text-xs text-[#5e6b65]"><span className="font-semibold lg:hidden">Version: </span>{firstString(record, ["version", "version_label"], "—")}</p><p className="text-xs text-[#74807b]">{formatDate(record.updated_at ?? record.created_at)}</p><div><Badge tone={statusTone(recordStatus)}>{recordStatus.replaceAll("_", " ")}</Badge></div></a>; })}</div>}</div>
  </div>;
}
