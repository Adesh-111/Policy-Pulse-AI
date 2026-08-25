"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="grid min-h-screen place-items-center bg-[#f6f7f4] p-6"><div className="max-w-md rounded-3xl border bg-white p-8 text-center shadow-sm"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-700"><TriangleAlert className="size-5" /></span><h1 className="mt-5 text-xl font-semibold">This view couldn’t be completed</h1><p className="mt-3 text-sm leading-6 text-[#6c7872]">No changes were made. You can safely retry, or return to the dashboard if the problem continues.</p>{error.digest && <p className="mt-3 font-mono text-[10px] text-[#8b9590]">Reference: {error.digest}</p>}<button type="button" onClick={reset} className="mx-auto mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-[#0d684d] px-4 text-xs font-semibold text-white"><RefreshCw className="size-4" />Try again</button></div></main>;
}
