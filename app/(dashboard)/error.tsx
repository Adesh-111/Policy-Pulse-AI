"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center"><span className="mx-auto grid size-11 place-items-center rounded-2xl bg-rose-50 text-rose-700"><TriangleAlert className="size-5" /></span><h1 className="mt-4 text-lg font-semibold">We couldn’t load this workspace view</h1><p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-[#6c7872]">The request failed safely. Retry the view; persisted workflow checkpoints and stored documents are unaffected.</p>{error.digest && <p className="mt-2 font-mono text-[10px] text-[#8b9590]">Reference: {error.digest}</p>}<button type="button" onClick={reset} className="mx-auto mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#0d684d] px-4 text-xs font-semibold text-white"><RefreshCw className="size-4" />Retry view</button></div>;
}
