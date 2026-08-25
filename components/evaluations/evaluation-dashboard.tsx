"use client";

import { useMemo, useState } from "react";
import { Beaker, Gauge, LoaderCircle, Play, TriangleAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiRequest, arrayValue, firstString, formatDate, numberValue, recordValue, type ApiRecord } from "@/components/api";
import { useApi } from "@/components/hooks/use-api";
import { Badge, EmptyState, ErrorState, LoadingState, SectionCard, statusTone } from "@/components/ui";
import type { AppRole } from "@/lib/auth/roles";

const metrics = [
  ["retrieval_precision", "Retrieval precision"], ["retrieval_recall", "Retrieval recall"], ["context_relevance", "Context relevance"], ["answer_relevance", "Answer relevance"], ["faithfulness", "Faithfulness"], ["citation_correctness", "Citation correctness"], ["change_detection_accuracy", "Change detection"], ["conflict_detection_accuracy", "Conflict detection"], ["unsupported_claim_rate", "Unsupported claims"],
] as const;

function score(record: ApiRecord, key: string) {
  const value = numberValue(record[key]);
  return Math.round(value * (value <= 1 ? 100 : 1) * 10) / 10;
}

const variantLabels: Record<string, string> = {
  openai_without_rag: "OpenAI without RAG",
  openai_with_rag: "OpenAI with RAG",
  rag_agents_reflection: "RAG + agents + reflection",
};

function methodName(run: ApiRecord) {
  const variant = firstString(run, ["variant", "label", "mode", "method"], "Evaluation");
  return variantLabels[variant] ?? variant.replaceAll("_", " ");
}

export function EvaluationDashboard({ role }: { role: AppRole }) {
  const { data, loading, error, refresh } = useApi("/api/v1/evaluations");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const root = recordValue(data);
  const runs = arrayValue<ApiRecord>(data, ["evaluations", "runs", "results"]);
  const canRun = role === "administrator" || role === "policy_manager";
  const chartData = useMemo(() => runs.slice(0, 12).map((run) => ({ name: methodName(run), faithfulness: score(run, "faithfulness"), citations: score(run, "citation_correctness"), relevance: score(run, "answer_relevance") })), [runs]);
  async function run(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setRunning(true); setRunError(""); const form = new FormData(event.currentTarget); const mode = String(form.get("mode")); const modes = mode === "all" ? ["no_rag", "rag", "agentic_self_reflection"] : [mode]; try { await apiRequest("/api/v1/evaluations", { method: "POST", body: JSON.stringify({ modes, questionIds: [] }) }); refresh(); } catch (caught) { setRunError(caught instanceof Error ? caught.message : "The evaluation run could not be started."); } finally { setRunning(false); } }
  if (loading && !data) return <SectionCard><LoadingState label="Loading evaluation history…" rows={7} /></SectionCard>;
  if (error && !data) return <SectionCard><ErrorState message={error} onRetry={refresh} /></SectionCard>;
  return <div className="space-y-6">
    <section className="grid gap-5 rounded-2xl border bg-white p-5 lg:grid-cols-[1fr_auto] lg:items-center sm:p-6"><div><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Beaker className="size-[18px]" /></span><div><h2 className="text-sm font-semibold">Run the evaluation suite</h2><p className="mt-1 text-xs text-[#74807b]">{numberValue(root.question_count ?? root.questionCount, 20)} curated questions · Results, latency, tokens, and cost are persisted</p></div></div></div>{canRun ? <form onSubmit={run} className="flex flex-col gap-2 sm:flex-row"><select name="mode" className="h-10 rounded-xl border bg-white px-3 text-xs font-semibold" defaultValue="all"><option value="all">Compare all three methods</option><option value="no_rag">OpenAI without RAG</option><option value="rag">OpenAI with RAG</option><option value="agentic_self_reflection">RAG + agents + reflection</option></select><button disabled={running} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0d684d] px-4 text-xs font-semibold text-white disabled:opacity-50">{running ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}{running ? "Starting…" : "Run evaluation"}</button></form> : <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">Auditor access is read-only. Existing evaluation evidence remains available below.</p>}{runError && <p role="alert" className="lg:col-span-2 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><TriangleAlert className="size-4" />{runError}</p>}</section>
    {!runs.length ? <SectionCard><EmptyState icon={Gauge} title="No evaluation runs yet" description="Run the persisted evaluation dataset to compare the baseline, grounded RAG, and agentic self-reflective workflow. No metric is shown until it has been measured." /></SectionCard> : <><SectionCard title="Quality comparison" description="Scores are measured on the stored evaluation dataset; unsupported-claim rate is lower-is-better."><div className="h-[340px] p-4 sm:p-6"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 30 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e9e6" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: "#718079" }} angle={-12} textAnchor="end" interval={0} /><YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#718079" }} /><Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dce3df", fontSize: 11 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="faithfulness" fill="#0d684d" radius={[5, 5, 0, 0]} /><Bar dataKey="citations" fill="#409578" radius={[5, 5, 0, 0]} /><Bar dataKey="relevance" fill="#d6a343" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></SectionCard><SectionCard title="Evaluation runs" description="Complete measurement set with operational telemetry."><div className="overflow-x-auto"><table className="min-w-[1100px] w-full text-left"><thead className="bg-[#fafbf9] text-[9px] font-bold uppercase tracking-[0.1em] text-[#7d8882]"><tr><th className="px-5 py-3">Method</th>{metrics.map(([, label]) => <th className="px-3 py-3" key={label}>{label}</th>)}<th className="px-3 py-3">Latency</th><th className="px-3 py-3">Cost</th></tr></thead><tbody className="divide-y divide-[#edf0ee]">{runs.map((run, index) => { const status = firstString(run, ["status"], "complete"); return <tr key={firstString(run, ["id"], String(index))} className="text-[11px]"><td className="px-5 py-4"><p className="font-semibold capitalize">{methodName(run)}</p><p className="mt-1 text-[9px] text-[#87918c]">{formatDate(run.created_at, true)}</p><div className="mt-1"><Badge tone={statusTone(status)}>{status}</Badge></div></td>{metrics.map(([key]) => <td className="px-3 py-4 font-mono" key={key}>{run[key] == null ? "—" : `${score(run, key)}%`}</td>)}<td className="px-3 py-4 font-mono">{numberValue(run.latency_ms).toLocaleString()} ms</td><td className="px-3 py-4 font-mono">${numberValue(run.estimated_cost_usd ?? run.estimated_cost).toFixed(4)}</td></tr>; })}</tbody></table></div></SectionCard></>}
  </div>;
}
