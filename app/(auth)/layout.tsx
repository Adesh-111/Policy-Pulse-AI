import Link from "next/link";
import { Quote } from "lucide-react";
import { Brand } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[.9fr_1.1fr]">
      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-9 lg:px-14">
        <div className="flex items-center justify-between"><Brand /><Link href="/" className="text-xs font-semibold text-[#66736d] hover:text-[#0d684d]">Back to overview</Link></div>
        <div className="mx-auto flex w-full max-w-[430px] flex-1 items-center py-12">{children}</div>
        <p className="text-center text-[11px] leading-5 text-[#89928e]">By continuing, you agree to your organization’s acceptable-use and data-governance policies.</p>
      </section>
      <aside className="relative hidden overflow-hidden bg-[#0d4e3b] p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="app-grid absolute inset-0 opacity-30" /><div className="absolute -right-20 -top-20 size-96 rounded-full bg-emerald-300/10 blur-3xl" />
        <div className="relative"><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-200">Evidence first</p><h2 className="mt-5 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.04em]">Move from changed wording to an approved plan — without losing the source.</h2></div>
        <div className="relative rounded-3xl border border-white/10 bg-white/[.06] p-7 backdrop-blur"><Quote className="size-6 text-emerald-200" /><p className="mt-5 max-w-xl text-base leading-7 text-emerald-50/85">PolicyPulse keeps evidence, confidence, reviewers, and decisions visible. The system can accelerate analysis, but authorized people remain accountable for consequential outcomes.</p><div className="mt-6 flex items-center gap-3"><span className="size-2 rounded-full bg-emerald-300" /><span className="text-xs font-semibold text-emerald-100">Grounded answers · Human approval · Audit trail</span></div></div>
      </aside>
    </main>
  );
}
