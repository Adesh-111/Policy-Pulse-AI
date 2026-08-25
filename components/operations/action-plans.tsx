"use client";

import { useState } from "react";
import { Building2, Check, ClipboardList, LoaderCircle, Save, Target } from "lucide-react";
import { apiRequest, arrayValue, departmentName, firstString, formatDate, idOf, numberValue, type ApiRecord } from "@/components/api";
import { useApi } from "@/components/hooks/use-api";
import { Badge, EmptyState, ErrorState, LoadingState, SeedLabel, statusTone } from "@/components/ui";

function ActionItem({ item, planId, onSaved }: { item: ApiRecord; planId: string; onSaved: () => void }) {
  const itemId = idOf(item);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(""); const form = new FormData(event.currentTarget);
    const nextStatus = String(form.get("status"));
    const requestedProgress = Number(form.get("progressPercent"));
    try { await apiRequest(`/api/v1/action-plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, progressPercent: nextStatus === "completed" ? 100 : Math.min(requestedProgress, 95), note: String(form.get("note") ?? "").trim() }) }); setMessage("Progress saved"); onSaved(); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "Could not save progress."); } finally { setSaving(false); }
  }
  const status = firstString(item, ["status"], "not_started");
  return <form onSubmit={submit} className="rounded-xl border border-[#e2e7e4] bg-[#fafbf9] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xs font-semibold leading-5">{firstString(item, ["title", "action", "description"], "Implementation action")}</h3><p className="mt-1 text-[11px] text-[#7b8681]">Owner: {firstString(item, ["owner", "assignee_name", "responsible_party"], "Unassigned")} · Due {formatDate(item.due_date)}</p></div><Badge tone={statusTone(status)}>{status.replaceAll("_", " ")}</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-[170px_1fr]"><label className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7b8681]">Status<select name="status" defaultValue={status} className="mt-1.5 h-9 w-full rounded-lg border bg-white px-2 text-xs"><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option></select></label><label className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7b8681]">Progress · {numberValue(item.progress_percent)}%<input name="progressPercent" type="range" min="0" max="100" step="5" defaultValue={numberValue(item.progress_percent)} className="mt-3 w-full accent-[#0d684d]" /></label></div><label className="mt-3 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#7b8681]">Progress note<input name="note" className="mt-1.5 h-9 w-full rounded-lg border bg-white px-3 text-xs" placeholder="Optional implementation note…" /></label><div className="mt-3 flex items-center justify-between gap-3"><p className={`text-[10px] ${message === "Progress saved" ? "text-emerald-700" : "text-rose-700"}`}>{message}</p><button disabled={saving || !itemId} type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0d684d] px-3 text-[11px] font-semibold text-white disabled:opacity-50">{saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}Save progress</button></div></form>;
}

export function ActionPlans() {
  const { data, loading, error, refresh } = useApi("/api/v1/action-plans");
  const plans = arrayValue<ApiRecord>(data, ["action_plans", "plans"]);
  if (loading && !data) return <div className="rounded-2xl border bg-white"><LoadingState label="Loading department action plans…" rows={7} /></div>;
  if (error && !data) return <div className="rounded-2xl border bg-white"><ErrorState message={error} onRetry={refresh} /></div>;
  if (!plans.length) return <div className="rounded-2xl border bg-white"><EmptyState icon={ClipboardList} title="No action plans are assigned" description="Approved comparison findings generate department-specific actions with owners, due dates, and progress tracking." /></div>;
  return <div className="space-y-5">{plans.map((plan, index) => { const planId = idOf(plan); const items = arrayValue<ApiRecord>(plan.items ?? plan.action_items ?? plan.actions); const status = firstString(plan, ["status"], "open"); return <section key={planId || index} className="overflow-hidden rounded-2xl border bg-white"><div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Target className="size-[18px]" /></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{firstString(plan, ["title", "name"], "Department action plan")}</h2><SeedLabel seed={plan.is_seed === true} /></div><p className="mt-1 text-xs text-[#78837e]"><Building2 className="mr-1 inline size-3.5" />{departmentName(plan)} · {items.length} action{items.length === 1 ? "" : "s"}</p></div></div><Badge tone={statusTone(status)}>{status.replaceAll("_", " ")}</Badge></div><div className="space-y-3 p-5 sm:p-6">{items.length ? items.map((item, itemIndex) => <ActionItem key={idOf(item) || itemIndex} item={item} planId={planId} onSaved={refresh} />) : <EmptyState compact icon={Check} title="No action items in this plan" description="The approved analysis did not publish implementation tasks for this department." />}</div></section>; })}</div>;
}
