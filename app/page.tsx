import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Bot, Building2, Check, FileDiff, FileSearch, Fingerprint, GitBranch, LockKeyhole, MessageSquareText, Network, ShieldCheck, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Policy intelligence you can act on",
  description: "Trace every policy change to its evidence, risk, owner, approval, and action plan.",
};

const capabilities = [
  { icon: FileDiff, title: "Version-aware comparison", text: "Find added, removed, and modified rules — including deadlines, eligibility, exceptions, and ownership." },
  { icon: Network, title: "Cross-policy conflict detection", text: "Surface contradictory requirements across your authorized policy library, with the passages that caused the finding." },
  { icon: ShieldCheck, title: "Risk and impact mapping", text: "Connect each supported change to affected departments, a calibrated risk level, and an accountable next step." },
  { icon: BadgeCheck, title: "Human approval by design", text: "High-risk findings pause for a reviewer. Decisions, notes, revisions, and analysis versions stay in the audit trail." },
  { icon: MessageSquareText, title: "Grounded policy answers", text: "Ask questions across permitted documents and receive source cards with document, version, section, page, and excerpt." },
  { icon: Fingerprint, title: "Evidence from end to end", text: "Follow a conclusion back to retrieved evidence, quality review, workflow checkpoint, approval, and report." },
];

const stages = ["Validate documents", "Extract policy rules", "Retrieve evidence", "Detect change & conflict", "Assess impact & risk", "Review quality", "Approve high risk", "Publish action plan"];

export default function HomePage() {
  return (
    <main className="overflow-hidden bg-[#f7f8f5] text-[#17211e]">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <nav className="hidden items-center gap-7 text-sm font-medium text-[#4c5b55] md:flex" aria-label="Primary navigation">
            <a href="#workflow" className="hover:text-[#0d684d]">How it works</a><a href="#capabilities" className="hover:text-[#0d684d]">Capabilities</a><a href="#governance" className="hover:text-[#0d684d]">Governance</a>
          </nav>
          <div className="flex items-center gap-2"><Link href="/login" className="hidden h-10 items-center rounded-xl px-4 text-sm font-semibold text-[#33423c] hover:bg-white/60 sm:inline-flex">Sign in</Link><Link href="/register" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0d684d] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#09543f]">Get started <ArrowRight className="size-4" aria-hidden="true" /></Link></div>
        </div>
      </header>

      <section className="hero-glow app-grid relative min-h-[780px] border-b border-[#dfe5e1] pt-36 sm:pt-44">
        <div className="absolute left-[8%] top-36 size-40 rounded-full bg-emerald-200/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 pb-24 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:pb-32">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/75 px-3 py-1.5 text-xs font-semibold text-[#0b6047] backdrop-blur"><Sparkles className="size-3.5" aria-hidden="true" />Evidence-grounded policy intelligence</div>
            <h1 className="mt-7 max-w-3xl text-[46px] font-semibold leading-[1.04] tracking-[-0.055em] text-[#13211c] sm:text-[64px] lg:text-[70px]">Know what changed. <span className="text-[#0d684d]">Know what to do.</span></h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-[#5b6964] sm:text-lg">PolicyPulse AI turns old and new policy documents into cited changes, conflicts, department impact, risk assessments, and reviewable action plans — without separating the answer from its evidence.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0d684d] px-5 text-sm font-semibold text-white shadow-[0_9px_30px_rgba(13,104,77,.2)] transition hover:-translate-y-0.5 hover:bg-[#09543f]">Create your workspace <ArrowRight className="size-4" /></Link><Link href="/login" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#cdd6d1] bg-white/75 px-5 text-sm font-semibold text-[#314039] backdrop-blur transition hover:bg-white">Open dashboard</Link></div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-[#65736d]">{["Private document storage", "Role-based access", "Human approval gates"].map((item) => <span key={item} className="inline-flex items-center gap-2"><Check className="size-3.5 text-[#0d684d]" aria-hidden="true" />{item}</span>)}</div>
          </div>

          <div className="relative mx-auto w-full max-w-[590px]">
            <div className="absolute -inset-5 rounded-[34px] bg-gradient-to-br from-emerald-200/35 to-amber-100/45 blur-2xl" />
            <div className="paper-shadow relative overflow-hidden rounded-[28px] border border-white/80 bg-white/95 p-3 backdrop-blur">
              <div className="rounded-[20px] border border-[#e0e6e2] bg-[#f8faf8]">
                <div className="flex items-center justify-between border-b border-[#e5eae6] px-5 py-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#0d684d]">Analysis workflow</p><p className="mt-1 text-sm font-semibold">Policy comparison</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200"><span className="size-1.5 rounded-full bg-amber-500" /> Human review built in</span></div>
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  <div className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2 text-xs font-semibold"><FileSearch className="size-4 text-[#0d684d]" /> Older policy</div><div className="mt-4 h-2.5 w-4/5 rounded bg-[#dfe5e1]" /><div className="mt-2 h-2.5 w-3/5 rounded bg-[#edf0ee]" /><div className="mt-5 inline-flex rounded-full bg-[#eef1ef] px-2 py-1 text-[10px] text-[#66726d]">Private source</div></div>
                  <div className="rounded-xl border bg-white p-4"><div className="flex items-center gap-2 text-xs font-semibold"><FileSearch className="size-4 text-[#0d684d]" /> Newer policy</div><div className="mt-4 h-2.5 w-3/4 rounded bg-[#a8d4c1]" /><div className="mt-2 h-2.5 w-4/5 rounded bg-[#dbeae3]" /><div className="mt-5 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">Indexed</div></div>
                </div>
                <div className="mx-4 mb-4 rounded-xl border bg-white p-4">
                  <div className="flex items-center justify-between"><p className="text-xs font-semibold">Traceable output</p><span className="text-[10px] font-medium text-[#77827d]">No conclusion without evidence</span></div>
                  <div className="mt-4 space-y-2.5">{[{ icon: FileDiff, label: "Changes", color: "bg-sky-50 text-sky-700" }, { icon: ShieldCheck, label: "Risk & impact", color: "bg-amber-50 text-amber-700" }, { icon: Building2, label: "Department actions", color: "bg-emerald-50 text-emerald-700" }].map(({ icon: Icon, label, color }, index) => <div key={label} className="flex items-center gap-3 rounded-lg bg-[#fafbf9] p-2.5"><span className={`grid size-8 place-items-center rounded-lg ${color}`}><Icon className="size-4" /></span><div className="flex-1"><div className={`h-2 rounded bg-[#dce2de] ${index === 0 ? "w-1/2" : index === 1 ? "w-2/3" : "w-3/5"}`} /><div className="mt-1.5 h-1.5 w-1/3 rounded bg-[#edf0ee]" /></div><span className="text-[10px] font-semibold text-[#0d684d]">{label}</span></div>)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32"><div className="grid gap-14 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0d684d]">One resumable workflow</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">A clear path from upload to accountable action.</h2><p className="mt-5 text-sm leading-7 text-[#68756f]">Each stage preserves its state and evidence. Low confidence triggers quality review; high risk pauses for an authorized person; interrupted work resumes from a checkpoint.</p></div><ol className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{stages.map((stage, index) => <li key={stage} className="flex items-center gap-4 rounded-2xl border border-[#e0e5e2] bg-white p-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e8f3ee] font-mono text-xs font-bold text-[#0d684d]">{String(index + 1).padStart(2, "0")}</span><span className="text-sm font-semibold text-[#26352f]">{stage}</span>{index < stages.length - 1 && <GitBranch className="ml-auto size-4 text-[#a5afaa]" />}</li>)}</ol></div></section>

      <section id="capabilities" className="border-y border-[#dfe5e1] bg-[#102a22] py-24 text-white sm:py-32"><div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="max-w-2xl"><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">Built for policy work</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Analysis that stays attached to its source.</h2><p className="mt-5 text-sm leading-7 text-emerald-100/65">AI accelerates the investigation. Evidence, permissions, approval, and auditability keep people in control.</p></div><div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">{capabilities.map(({ icon: Icon, title, text }) => <article key={title} className="bg-[#102a22] p-7 transition hover:bg-[#143329]"><span className="grid size-10 place-items-center rounded-xl bg-white/8 text-emerald-300 ring-1 ring-white/10"><Icon className="size-[18px]" /></span><h3 className="mt-6 text-base font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-emerald-50/58">{text}</p></article>)}</div></div></section>

      <section id="governance" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32"><div className="rounded-[32px] border border-[#dce3df] bg-white p-7 sm:p-12 lg:p-16"><div className="grid items-center gap-12 lg:grid-cols-2"><div><span className="grid size-12 place-items-center rounded-2xl bg-[#e8f3ee] text-[#0d684d]"><LockKeyhole className="size-5" /></span><h2 className="mt-7 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Governance isn’t a post-processing step.</h2><p className="mt-5 text-sm leading-7 text-[#68756f]">Role-based access applies to policies, retrieval, analysis, and administration. High and critical findings cannot silently become final. Every consequential action is attributable.</p></div><div className="grid gap-3">{[{ label: "Administrator", text: "Organization controls, users, usage, and audit" }, { label: "Policy manager", text: "Upload, compare, review, approve, and report" }, { label: "Department user", text: "Authorized policies, assigned actions, and assistant" }, { label: "Auditor", text: "Read-only evidence, comparison, approval, and audit views" }].map(({ label, text }) => <div key={label} className="flex gap-4 rounded-2xl border border-[#e2e7e4] bg-[#fafbf9] p-4"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white text-[#0d684d] ring-1 ring-[#dfe5e1]"><Check className="size-4" /></span><div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs leading-5 text-[#737f79]">{text}</p></div></div>)}</div></div></div></section>

      <section className="px-5 pb-24 sm:px-8 sm:pb-32"><div className="relative mx-auto max-w-7xl overflow-hidden rounded-[32px] bg-[#0d684d] px-7 py-16 text-center text-white sm:px-12"><Bot className="absolute -right-8 -top-10 size-52 text-white/[.04]" /><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-200">Make policy operational</p><h2 className="mx-auto mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Give every policy change an owner, an approval, and an evidence trail.</h2><div className="mt-8 flex justify-center"><Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#0d684d] shadow-lg transition hover:-translate-y-0.5">Create your workspace <ArrowRight className="size-4" /></Link></div></div></section>

      <footer className="border-t border-[#dfe5e1] bg-white"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8"><Brand /><p className="text-xs text-[#74807b]">Policy intelligence with evidence, checkpoints, and human judgment.</p><div className="flex gap-5 text-xs font-semibold text-[#53615b]"><Link href="/login">Sign in</Link><Link href="/register">Register</Link></div></div></footer>
    </main>
  );
}
