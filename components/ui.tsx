import type { LucideIcon } from "lucide-react";
import { ArrowRight, Inbox, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.19em] text-[#0d684d]">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-[#17211e] sm:text-[30px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[#65716c]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function ButtonLink({ href, children, variant = "primary", className = "" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  const styles = {
    primary: "bg-[#0d684d] text-white shadow-sm hover:bg-[#09543f]",
    secondary: "border border-[#d8dfdb] bg-white text-[#23312c] hover:border-[#bdc9c3] hover:bg-[#fafbf9]",
    ghost: "text-[#43514c] hover:bg-[#edf1ee]",
  };
  return <Link href={href} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${styles[variant]} ${className}`}>{children}</Link>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" | "purple" }) {
  const tones = {
    neutral: "bg-[#eef1ef] text-[#59645f] ring-[#dce2de]",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warning: "bg-amber-50 text-amber-800 ring-amber-200",
    danger: "bg-rose-50 text-rose-700 ring-rose-200",
    info: "bg-sky-50 text-sky-700 ring-sky-200",
    purple: "bg-violet-50 text-violet-700 ring-violet-200",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export function statusTone(value?: string): "neutral" | "success" | "warning" | "danger" | "info" | "purple" {
  const status = value?.toLowerCase() ?? "";
  if (["complete", "completed", "indexed", "approved", "active", "passed", "resolved", "success"].some((v) => status.includes(v))) return "success";
  if (["failed", "rejected", "critical", "error", "overdue", "blocked"].some((v) => status.includes(v))) return "danger";
  if (["pending", "waiting", "review", "medium", "revision"].some((v) => status.includes(v))) return "warning";
  if (["processing", "running", "extracting", "embedding", "high", "uploaded"].some((v) => status.includes(v))) return "info";
  return "neutral";
}

export function SectionCard({ children, className = "", title, description, action }: { children: ReactNode; className?: string; title?: string; description?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-[#dfe5e1] bg-white ${className}`}>
      {(title || description || action) && <div className="flex items-start justify-between gap-4 border-b border-[#e8ece9] px-5 py-4 sm:px-6"><div>{title && <h2 className="text-sm font-semibold text-[#1a2924]">{title}</h2>}{description && <p className="mt-1 text-xs leading-5 text-[#74807b]">{description}</p>}</div>{action}</div>}
      {children}
    </section>
  );
}

export function StatCard({ label, value, detail, icon: Icon, tone = "green" }: { label: string; value: string | number; detail?: string; icon: LucideIcon; tone?: "green" | "amber" | "rose" | "blue" }) {
  const tones = { green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", rose: "bg-rose-50 text-rose-700", blue: "bg-sky-50 text-sky-700" };
  return <div className="rounded-2xl border border-[#dfe5e1] bg-white p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-[#74807b]">{label}</p><p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#17211e]">{value}</p></div><span className={`grid size-10 place-items-center rounded-xl ${tones[tone]}`}><Icon className="size-[18px]" aria-hidden="true" /></span></div>{detail && <p className="mt-3 text-xs text-[#7a8580]">{detail}</p>}</div>;
}

export function EmptyState({ title, description, action, icon: Icon = Inbox, compact = false }: { title: string; description: string; action?: ReactNode; icon?: LucideIcon; compact?: boolean }) {
  return <div className={`flex flex-col items-center justify-center px-6 text-center ${compact ? "py-9" : "py-16"}`}><span className="grid size-11 place-items-center rounded-2xl bg-[#edf4f0] text-[#0d684d]"><Icon className="size-5" aria-hidden="true" /></span><h3 className="mt-4 text-sm font-semibold text-[#1a2924]">{title}</h3><p className="mt-1.5 max-w-md text-xs leading-5 text-[#74807b]">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function LoadingState({ label = "Loading current data…", rows = 3 }: { label?: string; rows?: number }) {
  return <div className="p-5" role="status" aria-live="polite"><div className="mb-4 flex items-center gap-2 text-xs text-[#6c7873]"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{label}</div><div className="space-y-3">{Array.from({ length: rows }, (_, index) => <div key={index} className="h-14 animate-pulse-soft rounded-xl bg-[#eef1ef]" />)}</div></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="m-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800" role="alert"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">We couldn’t load this view</p><p className="mt-1 text-xs leading-5 text-rose-700">{message}</p></div>{onRetry && <button type="button" onClick={onRetry} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-rose-200">Retry</button>}</div>;
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-[#0d684d] hover:text-[#064936]">{children}<ArrowRight className="size-3.5" aria-hidden="true" /></Link>;
}

export function SeedLabel({ seed }: { seed?: boolean }) {
  return seed ? <Badge tone="purple">Sample data</Badge> : null;
}

export const fieldClass = "mt-1.5 h-11 w-full rounded-xl border border-[#d8dfdb] bg-white px-3.5 text-sm text-[#203029] shadow-sm outline-none placeholder:text-[#9aa49f] focus:border-[#0d684d] focus:ring-3 focus:ring-[#0d684d]/10 disabled:bg-[#f1f3f1]";
export const textAreaClass = "mt-1.5 w-full rounded-xl border border-[#d8dfdb] bg-white px-3.5 py-3 text-sm text-[#203029] shadow-sm outline-none placeholder:text-[#9aa49f] focus:border-[#0d684d] focus:ring-3 focus:ring-[#0d684d]/10 disabled:bg-[#f1f3f1]";
export const primaryButtonClass = "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0d684d] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#09543f] disabled:cursor-not-allowed disabled:opacity-55";
export const secondaryButtonClass = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#d8dfdb] bg-white px-4 text-sm font-semibold text-[#2c3a35] shadow-sm transition hover:bg-[#f8faf8] disabled:cursor-not-allowed disabled:opacity-55";
