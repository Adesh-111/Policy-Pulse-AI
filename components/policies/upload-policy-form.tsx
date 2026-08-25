"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, FileUp, LoaderCircle, LockKeyhole, TriangleAlert, UploadCloud } from "lucide-react";
import { apiRequest, firstString, idOf, isRecord, recordValue } from "@/components/api";
import { fieldClass, primaryButtonClass, textAreaClass } from "@/components/ui";

const allowedExtensions = ["pdf", "docx", "txt", "md", "markdown"];
const maxBytes = 20 * 1024 * 1024;
const stages = ["Verify file checksum", "Create secure upload", "Transfer to private storage", "Queue document processing"];

function policyMimeType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "md" || extension === "markdown") return "text/markdown";
  return "text/plain";
}

export function UploadPolicyForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState(-1);
  const [error, setError] = useState("");

  function choose(candidate?: File) {
    setError("");
    if (!candidate) return setFile(null);
    const extension = candidate.name.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedExtensions.includes(extension)) return setError("Choose a PDF, DOCX, TXT, or Markdown document.");
    if (candidate.size === 0) return setError("The selected file is empty.");
    if (candidate.size > maxBytes) return setError("The file exceeds the 20 MB upload limit.");
    setFile(candidate);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setError("Choose a policy document before continuing.");
    setSubmitting(true); setError("");
    const form = new FormData(event.currentTarget);
    const mimeType = policyMimeType(file);
    const metadata = {
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      category: String(form.get("category") ?? "").trim(),
      version: String(form.get("version") ?? "").trim(),
      effectiveDate: String(form.get("effectiveDate") ?? ""),
      departmentName: String(form.get("departmentName") ?? "").trim(),
      designation: String(form.get("designation") ?? "new"),
      fileName: file.name,
      mimeType,
      fileSize: file.size,
    };
    try {
      setStage(0);
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      setStage(1);
      const upload = await apiRequest("/api/v1/documents/upload-url", { method: "POST", body: JSON.stringify({ ...metadata, checksum }) });
      const uploadRecord = recordValue(upload, ["upload"]);
      const documentRecord = isRecord(upload) && isRecord(upload.document) ? upload.document : uploadRecord;
      const documentId = idOf(documentRecord) || (isRecord(upload) ? firstString(upload, ["documentId", "id"], "") : "");
      const uploadUrl = firstString(uploadRecord, ["uploadUrl", "signedUrl", "signed_url"], isRecord(upload) ? firstString(upload, ["uploadUrl", "signedUrl", "signed_url"], "") : "");
      const storagePath = firstString(uploadRecord, ["storagePath", "path", "storage_path"], "");
      if (!documentId) throw new Error("The document service did not return a document identifier.");
      if (!uploadUrl) throw new Error("The storage service did not return a signed upload URL.");
      setStage(2);
      const transfer = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "content-type": mimeType } });
      if (!transfer.ok) throw new Error("The file transfer to private storage failed.");
      setStage(3);
      await apiRequest(`/api/v1/documents/${encodeURIComponent(documentId)}/upload-complete`, { method: "POST", body: JSON.stringify({ storagePath, filename: file.name, sizeBytes: file.size, contentType: mimeType }) });
      router.push(`/policies/${documentId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The upload could not be completed.");
      setSubmitting(false);
    }
  }

  return <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_340px]">
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 sm:p-6"><div><h2 className="text-sm font-semibold">Document file</h2><p className="mt-1 text-xs leading-5 text-[#75817b]">Files are uploaded directly to private Supabase Storage using a short-lived signed URL.</p></div><input ref={fileInput} type="file" className="sr-only" accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={(event) => choose(event.target.files?.[0])} disabled={submitting} /><button type="button" disabled={submitting} onClick={() => fileInput.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); }} className={`mt-5 flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${dragging ? "border-[#0d684d] bg-emerald-50" : file ? "border-emerald-300 bg-emerald-50/40" : "border-[#cfd8d3] bg-[#fafbf9] hover:border-[#8bb7a5] hover:bg-[#f5faf7]"}`}><span className="grid size-12 place-items-center rounded-2xl bg-white text-[#0d684d] shadow-sm ring-1 ring-[#dfe5e1]">{file ? <Check className="size-5" /> : <UploadCloud className="size-5" />}</span><p className="mt-4 text-sm font-semibold text-[#2a3933]">{file ? file.name : "Drop a policy here, or choose a file"}</p><p className="mt-1.5 text-xs text-[#7a8580]">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB - Ready for validation` : "PDF, DOCX, TXT, or Markdown - Maximum 20 MB"}</p></button></section>
      <section className="rounded-2xl border bg-white p-5 sm:p-6"><h2 className="text-sm font-semibold">Policy metadata</h2><p className="mt-1 text-xs leading-5 text-[#75817b]">Complete metadata improves filtering, retrieval, comparison, and citations.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-[#415049] sm:col-span-2">Policy title<input name="title" className={fieldClass} required placeholder="Student attendance policy" disabled={submitting} /></label><label className="text-xs font-semibold text-[#415049]">Category<input name="category" className={fieldClass} required placeholder="Academic affairs" disabled={submitting} /></label><label className="text-xs font-semibold text-[#415049]">Version<input name="version" className={fieldClass} required placeholder="2.1" disabled={submitting} /></label><label className="text-xs font-semibold text-[#415049]">Effective date<span className="relative block"><CalendarDays className="pointer-events-none absolute bottom-3.5 left-3.5 size-4 text-[#8b9691]" /><input name="effectiveDate" type="date" className={`${fieldClass} pl-10`} required disabled={submitting} /></span></label><label className="text-xs font-semibold text-[#415049]">Department<input name="departmentName" className={fieldClass} required minLength={2} maxLength={120} placeholder="Academic Affairs" disabled={submitting} /></label><label className="text-xs font-semibold text-[#415049] sm:col-span-2">Version designation<select name="designation" className={fieldClass} defaultValue="new" disabled={submitting}><option value="old">Older / superseded version</option><option value="new">New policy version</option></select></label><label className="text-xs font-semibold text-[#415049] sm:col-span-2">Description <span className="font-normal text-[#89938e]">(optional)</span><textarea name="description" rows={4} className={textAreaClass} placeholder="Purpose, scope, or context for reviewers..." disabled={submitting} /></label></div></section>
    </div>
    <aside className="space-y-5"><section className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#e9f4ef] text-[#0d684d]"><LockKeyhole className="size-4" /></span><div><h2 className="text-sm font-semibold">Secure processing</h2><p className="mt-0.5 text-[11px] text-[#7a8580]">Untrusted document controls enabled</p></div></div><ol className="mt-5 space-y-3">{stages.map((label, index) => <li key={label} className="flex items-center gap-3"><span className={`grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold ${stage > index ? "bg-emerald-100 text-emerald-700" : stage === index ? "bg-[#0d684d] text-white" : "bg-[#eef1ef] text-[#7d8882]"}`}>{stage === index && submitting ? <LoaderCircle className="size-3.5 animate-spin" /> : stage > index ? <Check className="size-3.5" /> : index + 1}</span><span className={`text-xs ${stage === index ? "font-semibold text-[#283630]" : "text-[#6f7b75]"}`}>{label}</span></li>)}</ol></section>{error && <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-800" role="alert"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{error}</div>}<button type="submit" className={`${primaryButtonClass} w-full`} disabled={submitting}>{submitting ? <LoaderCircle className="size-4 animate-spin" /> : <FileUp className="size-4" />}{submitting ? "Uploading securely…" : "Upload and process"}</button><p className="px-2 text-center text-[10px] leading-4 text-[#88928d]">The document is treated as untrusted input. Its contents cannot override system instructions.</p></aside>
  </form>;
}
