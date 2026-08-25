import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return <main className="flex min-h-screen flex-col bg-[#f6f7f4] p-6"><Brand /><div className="m-auto flex max-w-md flex-col items-center text-center"><span className="grid size-14 place-items-center rounded-2xl bg-[#e7f1ec] text-[#0d684d]"><FileQuestion className="size-6" /></span><p className="mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0d684d]">404 · Not found</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">This record isn’t available</h1><p className="mt-4 text-sm leading-6 text-[#6c7872]">The page may have moved, the record may have been removed, or your role may not have access to it.</p><Link href="/dashboard" className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-[#0d684d] px-4 text-sm font-semibold text-white"><ArrowLeft className="size-4" />Return to dashboard</Link></div></main>;
}
