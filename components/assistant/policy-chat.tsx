"use client";

import { useRef, useState } from "react";
import { Bot, Filter, History, LoaderCircle, MessageSquareText, Plus, Quote, Send, ShieldCheck, Sparkles, Square, UserRound } from "lucide-react";
import { apiRequest, arrayValue, citationDisplay, firstString, idOf, isRecord, recordValue, type ApiRecord } from "@/components/api";
import { useApi } from "@/components/hooks/use-api";
import { Badge, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { formatGroundedAnswerForDisplay } from "@/lib/rag/format-answer";

type Source = ApiRecord;
type Message = { id: string; role: "user" | "assistant"; content: string; sources?: Source[]; pending?: boolean };

const suggestions = ["What changed between the selected policy versions?", "Which departments are affected by the latest changes?", "Show the evidence for the highest-risk finding."];

export function SourceCard({ source, index }: { source: Source; index: number }) {
  const citation = citationDisplay(source);
  if (!citation) return null;
  return <div className="rounded-xl border border-[#dce3df] bg-[#fafbf9] p-3"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#e5f1eb] text-[10px] font-bold text-[#0d684d]">{index + 1}</span><p className="truncate text-[11px] font-semibold">{citation.documentTitle}</p></div><Badge>v{citation.version}</Badge></div><p className="mt-2 text-[10px] text-[#7c8782]">{citation.sectionHeading}{citation.pageNumber ? ` · Page ${citation.pageNumber}` : " · Page unavailable"}</p><p className="mt-2 line-clamp-4 text-[11px] leading-5 text-[#5d6a64]">{citation.evidenceSnippet}</p></div>;
}

export function PolicyChat() {
  const { data: documentData, loading, error, refresh } = useApi("/api/v1/documents");
  const sessionsQuery = useApi("/api/v1/chat/sessions?pageSize=20");
  const documents = arrayValue<ApiRecord>(documentData, ["documents"]).filter((item) => firstString(item, ["processing_status", "status"], "").toLowerCase() === "indexed");
  const sessions = arrayValue<ApiRecord>(sessionsQuery.data, ["sessions"]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [department, setDepartment] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  function newConversation() {
    controllerRef.current?.abort();
    setSessionId(undefined);
    setMessages([]);
    setDocumentIds([]);
    setDepartment("");
    setChatError("");
  }

  async function loadSession(id: string) {
    if (streaming || id === sessionId) return;
    setChatError("");
    try {
      const payload = recordValue(
        await apiRequest(`/api/v1/chat/sessions/${encodeURIComponent(id)}`),
      );
      const chatSession = recordValue(payload, ["session"]);
      const storedMessages = arrayValue<ApiRecord>(payload, ["messages"]);
      setSessionId(id);
      setDocumentIds(arrayValue<string>(chatSession.document_filter_ids));
      setDepartment(arrayValue<string>(chatSession.department_filter_ids)[0] ?? "");
      setMessages(
        storedMessages.flatMap((message) => {
          const role = firstString(message, ["role"], "");
          if (role !== "user" && role !== "assistant") return [];
          return [{
            id: idOf(message) || crypto.randomUUID(),
            role,
            content:
              role === "assistant"
                ? formatGroundedAnswerForDisplay(firstString(message, ["content"], ""))
                : firstString(message, ["content"], ""),
            sources: arrayValue<Source>(message.citations),
          } satisfies Message];
        }),
      );
    } catch (caught) {
      setChatError(caught instanceof Error ? caught.message : "The conversation could not be restored.");
    }
  }

  function processPayload(raw: string, assistantId: string) {
    if (!raw || raw === "[DONE]") return;
    let payload: unknown = raw;
    try { payload = JSON.parse(raw); } catch { /* Plain streamed text is supported. */ }
    if (!isRecord(payload)) {
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content + String(payload) } : message));
      return;
    }
    const type = firstString(payload, ["type", "event"], "");
    const delta = firstString(payload, ["delta", "content", "text"], "");
    const sources = arrayValue<Source>(payload.sources ?? payload.citations ?? payload.evidence);
    const incomingSession = firstString(payload, ["sessionId", "session_id"], "");
    if (incomingSession) setSessionId(incomingSession);
    setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: delta && !type.includes("source") ? message.content + delta : message.content, sources: sources.length ? sources : message.sources } : message));
  }

  async function send(text = input) {
    const question = text.trim();
    if (!question || streaming) return;
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: question };
    const assistantId = crypto.randomUUID();
    const assistantMessage: Message = { id: assistantId, role: "assistant", content: "", pending: true };
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, userMessage, assistantMessage]); setInput(""); setChatError(""); setStreaming(true);
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const response = await fetch("/api/v1/chat", { method: "POST", credentials: "same-origin", signal: controller.signal, headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ message: question, sessionId, history, filters: { documentIds, departmentIds: department ? [department] : [] } }) });
      if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(isRecord(payload) ? firstString(payload, ["message", "error"], `Chat request failed (${response.status}).`) : `Chat request failed (${response.status}).`); }
      if (!response.body) throw new Error("The chat stream was not available.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) { processPayload(buffer, assistantId); buffer = ""; continue; }
        const events = buffer.split("\n\n"); buffer = events.pop() ?? "";
        for (const event of events) { const dataLines = event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()); if (dataLines.length) processPayload(dataLines.join("\n"), assistantId); }
      }
      if (buffer.trim()) processPayload(buffer.replace(/^data:\s*/gm, "").trim(), assistantId);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setChatError(caught instanceof Error ? caught.message : "The assistant could not complete the response.");
    } finally { setStreaming(false); controllerRef.current = null; setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, pending: false } : message)); sessionsQuery.refresh(); }
  }

  if (loading && !documentData) return <div className="rounded-2xl border bg-white"><LoadingState label="Preparing authorized policy context…" rows={6} /></div>;
  if (error && !documentData) return <div className="rounded-2xl border bg-white"><ErrorState message={error} onRetry={refresh} /></div>;

  return <div className="grid min-h-[690px] gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
    <aside className="no-print rounded-2xl border bg-white p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><History className="size-4 text-[#0d684d]" /><h2 className="text-xs font-semibold">Conversations</h2></div><button type="button" onClick={newConversation} className="grid size-7 place-items-center rounded-lg border text-[#0d684d] hover:bg-[#f2f7f4]" aria-label="New conversation"><Plus className="size-3.5" /></button></div><div className="soft-scrollbar mt-3 max-h-36 space-y-1 overflow-y-auto">{sessionsQuery.loading && !sessionsQuery.data ? <p className="p-2 text-[10px] text-[#7a8580]">Loading history…</p> : sessions.length ? sessions.map((item) => { const id = idOf(item); return <button key={id} type="button" onClick={() => void loadSession(id)} className={`block w-full truncate rounded-lg px-2.5 py-2 text-left text-[11px] ${id === sessionId ? "bg-[#e9f4ef] font-semibold text-[#0d684d]" : "text-[#5f6d67] hover:bg-[#f3f6f4]"}`}>{firstString(item, ["title"], "Policy question")}</button>; }) : <p className="rounded-lg bg-[#f5f7f5] p-2.5 text-[10px] leading-4 text-[#7b8681]">Your saved conversations will appear here.</p>}</div>{sessionsQuery.error && <p className="mt-2 text-[10px] text-rose-700">History unavailable.</p>}<div className="my-4 border-t" /><div className="flex items-center gap-2"><Filter className="size-4 text-[#0d684d]" /><h2 className="text-xs font-semibold">Retrieval scope</h2></div><p className="mt-2 text-[11px] leading-5 text-[#7a8580]">Filters narrow the authorized corpus; they never expand your access.</p><fieldset className="mt-5"><legend className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#7e8984]">Policy documents</legend><div className="soft-scrollbar mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">{documents.length ? documents.map((document) => { const id = idOf(document); return <label key={id} className="flex items-start gap-2.5 rounded-lg p-2 text-[11px] leading-4 text-[#506059] hover:bg-[#f3f6f4]"><input type="checkbox" checked={documentIds.includes(id)} onChange={(event) => setDocumentIds((current) => event.target.checked ? [...current, id] : current.filter((value) => value !== id))} className="mt-0.5 size-3.5 accent-[#0d684d]" /><span>{firstString(document, ["title", "name"], "Untitled policy")} <span className="text-[#89938e]">v{firstString(document, ["version"], "—")}</span></span></label>; }) : <p className="rounded-lg bg-[#f5f7f5] p-3 text-[11px] leading-5 text-[#7b8681]">No indexed documents are available.</p>}</div></fieldset><label className="mt-5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#7e8984]">Department filter<input value={department} onChange={(event) => setDepartment(event.target.value)} className="mt-2 h-9 w-full rounded-lg border bg-white px-3 text-xs font-normal tracking-normal" placeholder="Department ID or name" /></label><button type="button" onClick={() => { setDocumentIds([]); setDepartment(""); }} className="mt-4 text-[11px] font-semibold text-[#0d684d] hover:underline">Clear filters</button><div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 p-3"><div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-800"><ShieldCheck className="size-3.5" />Grounding rules</div><p className="mt-2 text-[10px] leading-4 text-emerald-800/75">Answers cite accessible sources. When evidence is insufficient, the assistant says so instead of inventing policy facts.</p></div></aside>
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white"><header className="no-print flex items-center justify-between border-b px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#e8f3ee] text-[#0d684d]"><Bot className="size-[18px]" /></span><div><h2 className="text-sm font-semibold">Policy assistant</h2><p className="mt-0.5 text-[10px] text-[#7b8681]">Hybrid retrieval · Reranked evidence · Streaming answer</p></div></div><Badge tone="success">Grounded</Badge></header>
      <div className="soft-scrollbar flex-1 overflow-y-auto p-5 sm:p-6">{messages.length === 0 ? <EmptyState icon={MessageSquareText} title="Ask a question about your policies" description="Select optional filters, then ask about changes, responsibilities, conflicts, deadlines, eligibility, or evidence." action={<div className="flex max-w-xl flex-wrap justify-center gap-2">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => void send(suggestion)} className="rounded-full border bg-white px-3 py-2 text-[11px] font-medium text-[#53615b] hover:border-[#9eb8ac] hover:text-[#0d684d]">{suggestion}</button>)}</div>} /> : <div className="mx-auto max-w-3xl space-y-6">{messages.map((message) => <article key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" && <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#e8f3ee] text-[#0d684d]"><Sparkles className="size-4" /></span>}<div className={`max-w-[86%] ${message.role === "user" ? "rounded-2xl rounded-tr-md bg-[#0d684d] px-4 py-3 text-white" : "min-w-0"}`}><div className={`whitespace-pre-wrap text-sm leading-7 ${message.role === "assistant" ? "text-[#34423c]" : "text-white"}`}>{message.content}{message.pending && !message.content && <span className="inline-flex items-center gap-2 text-xs text-[#718079]"><LoaderCircle className="size-3.5 animate-spin" />Retrieving and checking evidence…</span>}</div>{message.sources?.length ? <div className="mt-4"><p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#0d684d]"><Quote className="size-3" />Sources</p><div className="grid gap-2 sm:grid-cols-2">{message.sources.map((source, index) => <SourceCard key={index} source={source} index={index} />)}</div></div> : null}</div>{message.role === "user" && <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#e8ece9] text-[#5f6d67]"><UserRound className="size-4" /></span>}</article>)}</div>}</div>
      <footer className="no-print border-t bg-[#fafbf9] p-4 sm:p-5">{chatError && <div role="alert" className="mx-auto mb-3 max-w-3xl rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{chatError}</div>}<form onSubmit={(event) => { event.preventDefault(); void send(); }} className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-[#ccd6d1] bg-white p-2 shadow-sm focus-within:border-[#0d684d] focus-within:ring-3 focus-within:ring-[#0d684d]/10"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={2} className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-[#9aa49f]" placeholder="Ask about an authorized policy…" disabled={streaming} />{streaming ? <button type="button" onClick={() => controllerRef.current?.abort()} className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-600 text-white" aria-label="Stop response"><Square className="size-3.5 fill-current" /></button> : <button type="submit" disabled={!input.trim()} className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#0d684d] text-white disabled:opacity-40" aria-label="Send question"><Send className="size-4" /></button>}</form><p className="mx-auto mt-2 max-w-3xl text-center text-[9px] leading-4 text-[#909994]">Generated answers may require human review. Verify cited source text before making consequential decisions.</p></footer>
    </section>
  </div>;
}
