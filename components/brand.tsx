import Link from "next/link";
import { ScanSearch } from "lucide-react";

export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg" aria-label="PolicyPulse AI home">
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${inverse ? "bg-white/12 text-emerald-100 ring-1 ring-white/15" : "bg-[#0d684d] text-white"}`}>
        <ScanSearch aria-hidden="true" className="size-[19px]" strokeWidth={2.2} />
      </span>
      {!compact && <span className={`text-[17px] font-semibold tracking-[-0.02em] ${inverse ? "text-white" : "text-[#16231f]"}`}>PolicyPulse <span className={inverse ? "text-emerald-200" : "text-[#0d684d]"}>AI</span></span>}
    </Link>
  );
}
