"use client";

import { useState } from "react";
import { CalendarDays, Database, Download, FileCheck2, FileText, Layers3, LockKeyhole, ScanText, Tags } from "lucide-react";
import { apiRequest, boolValue, departmentName, firstString, formatDate, numberValue, recordValue } from "@/components/api";
import { useApi } from "@/components/hooks/use-api";
import { Badge, ButtonLink, EmptyState, ErrorState, LoadingState, SectionCard, SeedLabel, statusTone } from "@/components/ui";

const pipeline = ["uploaded", "extracting", "chunking", "embedding", "indexed"];

function Meta({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0f4f1] text-[#607069]"><Icon className="size-4" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#89938e]">{label}</p><p className="mt-1 text-xs font-semibold text-[#34423c]">{value}</p></div></div>;
}

export function PolicyDetail({ id }: { id: string }) {
  const { data, loading, error, refresh } = useApi(`/api/v1/documents/${encodeURIComponent(id)}`, { pollMs: 7000 });
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  async function download() {
    setDownloading(true); setDownloadError("");
    try {
      const result = recordValue(await apiRequest(`/api/v1/documents/${encodeURIComponent(id)}/download-url`));
      const url = firstString(result, ["url", "signedUrl", "signed_url"], "");
      if (!url) throw new Error("A protected download URL was not returned.");
      window.location.assign(url);
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : "The protected download could not be started.");
    } finally {
      setDownloading(false);
    }
  }
  if (loading && !data) return <SectionCard><LoadingState label="Loading policy and processing state…" rows={6} /></SectionCard>;
  if (error && !data) return <SectionCard><ErrorState message={error} onRetry={refresh} /></SectionCard>;
  const document = recordValue(data, ["document"]);
  if (!Object.keys(document).length) return <SectionCard><EmptyState icon={FileText} title="Policy not found" description="This policy may have been removed, or your role may not permit access." action={<ButtonLink href="/policies" variant="secondary">Return to policy library</ButtonLink>} /></SectionCard>;
  const status = firstString(document, ["processing_status", "status"], "Uploaded").toLowerCase();
  const currentIndex = pipeline.indexOf(status);
  const chunkCount = numberValue(document.chunk_count ?? recordValue(data, ["processing"]).chunk_count);

  return <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
    <div className="space-y-6">
      <SectionCard><div className="p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e8f3ee] text-[#0d684d]"><FileText className="size-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold tracking-[-0.025em]">{firstString(document, ["title", "name"], "Untitled policy")}</h2><SeedLabel seed={boolValue(document.is_seed)} /></div><p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c7872]">{firstString(document, ["description"], "No description was provided for this policy version.")}</p></div></div><Badge tone={statusTone(status)}>{status.replaceAll("_", " ")}</Badge></div><div className="mt-7 grid gap-5 border-t border-[#e8ece9] pt-6 sm:grid-cols-2 lg:grid-cols-4"><Meta icon={Tags} label="Category" value={firstString(document, ["category"], "Uncategorized")} /><Meta icon={Layers3} label="Version" value={firstString(document, ["version", "version_label"], "—")} /><Meta icon={CalendarDays} label="Effective" value={formatDate(document.effective_date)} /><Meta icon={LockKeyhole} label="Scope" value={departmentName(document)} /></div></div></SectionCard>
      <SectionCard title="Ingestion pipeline" description="Processing is resumable. A refresh does not discard completed stages."><div className="p-5 sm:p-6"><ol className="grid gap-3 sm:grid-cols-5">{pipeline.map((step, index) => { const complete = status === "indexed" || currentIndex > index; const active = currentIndex === index; return <li key={step} className={`relative rounded-xl border p-3 ${complete ? "border-emerald-200 bg-emerald-50" : active ? "border-sky-200 bg-sky-50" : "border-[#e4e8e5] bg-[#fafbf9]"}`}><div className="flex items-center justify-between"><span className={`grid size-7 place-items-center rounded-lg ${complete ? "bg-emerald-600 text-white" : active ? "bg-sky-600 text-white" : "bg-[#e9edeb] text-[#7e8984]"}`}>{complete ? <FileCheck2 className="size-3.5" /> : index + 1}</span>{active && <span className="size-2 animate-pulse rounded-full bg-sky-500" />}</div><p className="mt-3 text-[11px] font-semibold capitalize text-[#3b4943]">{step}</p></li>; })}</ol>{status === "failed" && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-800">Processing failed safely. The source remains private; review the validation message or upload a corrected document version.</div>}</div></SectionCard>
      <SectionCard title="Index summary" description="Document content available to authorized retrieval and citation workflows."><div className="grid gap-4 p-5 sm:grid-cols-3"><Meta icon={ScanText} label="Detected sections" value={String(numberValue(document.section_count))} /><Meta icon={Database} label="Indexed chunks" value={String(chunkCount)} /><Meta icon={Layers3} label="Embedding dimensions" value={chunkCount > 0 ? "1536" : "Not indexed"} /></div></SectionCard>
    </div>
    <aside className="space-y-5"><SectionCard title="Source file"><div className="p-5"><div className="rounded-xl bg-[#f6f8f6] p-4"><p className="truncate text-xs font-semibold">{firstString(document, ["original_filename", "filename"], "Protected document")}</p><p className="mt-1.5 text-[11px] text-[#7c8782]">Uploaded {formatDate(document.created_at, true)}</p></div><button type="button" onClick={() => void download()} disabled={downloading} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#d8dfdb] bg-white text-xs font-semibold text-[#33423c] hover:bg-[#fafbf9] disabled:opacity-55"><Download className="size-4" />{downloading ? "Preparing download..." : "Download via signed URL"}</button>{downloadError && <p role="alert" className="mt-2 text-[10px] leading-4 text-rose-700">{downloadError}</p>}<p className="mt-3 text-[10px] leading-4 text-[#8a948f]">Access is checked server-side. Download links are time-limited and should not be shared.</p></div></SectionCard><SectionCard title="Next step"><div className="p-5"><p className="text-xs leading-5 text-[#6f7b75]">Once this version is indexed, compare it with another indexed policy or ask a grounded question.</p><div className="mt-4 grid gap-2"><ButtonLink href="/comparisons/new">Start comparison</ButtonLink><ButtonLink href="/assistant" variant="secondary">Ask policy assistant</ButtonLink></div></div></SectionCard></aside>
  </div>;
}
