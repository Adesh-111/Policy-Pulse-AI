"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, GitCompareArrows, LoaderCircle, TriangleAlert } from "lucide-react";
import { apiRequest, arrayValue, departmentName, firstString, idOf, isRecord, recordValue, type ApiRecord } from "@/components/api";
import { useApi } from "@/components/hooks/use-api";
import { EmptyState, ErrorState, LoadingState, fieldClass, primaryButtonClass } from "@/components/ui";

function documentLabel(record: ApiRecord) { return `${firstString(record, ["title", "name"], "Untitled policy")} · v${firstString(record, ["version", "version_label"], "—")} · ${departmentName(record)}`; }

export function NewComparisonForm() {
  const router = useRouter();
  const { data, loading, error, refresh } = useApi("/api/v1/documents");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const documents = arrayValue<ApiRecord>(data, ["documents"]).filter((record) => firstString(record, ["processing_status", "status"], "").toLowerCase() === "indexed");
  const oldDocuments = documents.filter((record) => firstString(record, ["designation"], "") === "old");
  const newDocuments = documents.filter((record) => firstString(record, ["designation"], "") === "new");
  if (loading && !data) return <div className="rounded-2xl border bg-white"><LoadingState label="Loading indexed policy versions…" rows={4} /></div>;
  if (error && !data) return <div className="rounded-2xl border bg-white"><ErrorState message={error} onRetry={refresh} /></div>;
  if (!oldDocuments.length || !newDocuments.length) return <div className="rounded-2xl border bg-white"><EmptyState icon={FileText} title="Indexed old and new versions are required" description="Upload and index at least one document with each version designation before starting a comparison." action={<Link href="/policies/upload" className={primaryButtonClass}>Upload policy <ArrowRight className="size-4" /></Link>} /></div>;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError(""); setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const oldDocumentId = String(form.get("oldDocumentId") ?? "");
    const newDocumentId = String(form.get("newDocumentId") ?? "");
    if (oldDocumentId === newDocumentId) { setSubmitting(false); return setFormError("Choose two different policy versions."); }
    try {
      const created = await apiRequest("/api/v1/comparisons", { method: "POST", body: JSON.stringify({ oldDocumentId, newDocumentId, title: String(form.get("title") ?? "").trim() }) });
      const comparison = recordValue(created, ["comparison"]);
      const comparisonId = idOf(comparison) || (isRecord(created) ? firstString(created, ["comparisonId", "id"], "") : "");
      const runId = isRecord(created) ? firstString(created, ["runId", "workflowRunId", "run_id"], "") : "";
      if (!comparisonId) throw new Error("The comparison service did not return an identifier.");
      const started = await apiRequest(`/api/v1/comparisons/${encodeURIComponent(comparisonId)}/start`, { method: "POST", body: JSON.stringify({ runId: runId || undefined }) });
      const startedRunId = isRecord(started) ? firstString(started, ["runId", "workflowRunId", "run_id", "id"], runId) : runId;
      router.push(`/comparisons/${comparisonId}/progress${startedRunId ? `?run=${encodeURIComponent(startedRunId)}` : ""}`);
    } catch (caught) { setFormError(caught instanceof Error ? caught.message : "The comparison could not be started."); setSubmitting(false); }
  }

  return <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_340px]">
    <section className="rounded-2xl border bg-white p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e9f4ef] text-[#0d684d]"><GitCompareArrows className="size-[18px]" /></span><div><h2 className="text-sm font-semibold">Choose the policy versions</h2><p className="mt-1 text-xs text-[#74807b]">Only successfully indexed documents with the matching old/new designation are available.</p></div></div><div className="mt-6 grid gap-5"><label className="text-xs font-semibold text-[#415049]">Comparison title<input className={fieldClass} name="title" required placeholder="Attendance policy - 2025 to 2026" disabled={submitting} /></label><div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-semibold text-[#415049]">Older policy version<select className={fieldClass} name="oldDocumentId" required defaultValue="" disabled={submitting}><option value="" disabled>Select older version</option>{oldDocuments.map((record) => <option key={idOf(record)} value={idOf(record)}>{documentLabel(record)}</option>)}</select></label><label className="text-xs font-semibold text-[#415049]">Newer policy version<select className={fieldClass} name="newDocumentId" required defaultValue="" disabled={submitting}><option value="" disabled>Select newer version</option>{newDocuments.map((record) => <option key={idOf(record)} value={idOf(record)}>{documentLabel(record)}</option>)}</select></label></div></div></section>
    <aside className="space-y-5"><section className="rounded-2xl border bg-white p-5"><h2 className="text-sm font-semibold">What happens next</h2><ol className="mt-4 space-y-4">{["Rules and evidence are extracted from both versions.", "Specialist agents detect change, conflict, impact, and risk.", "A quality reviewer checks evidence support and citations.", "High or critical risk pauses for authorized approval."].map((item, index) => <li key={item} className="flex gap-3 text-xs leading-5 text-[#68756f]"><span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#eef3f0] font-mono text-[10px] font-bold text-[#0d684d]">{index + 1}</span>{item}</li>)}</ol></section>{formError && <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-800"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{formError}</div>}<button type="submit" className={`${primaryButtonClass} w-full`} disabled={submitting}>{submitting ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{submitting ? "Starting workflow…" : "Start comparison"}</button></aside>
  </form>;
}
