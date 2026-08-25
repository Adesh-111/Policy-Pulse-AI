"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  Building2,
  ClipboardCheck,
  FileText,
  Gauge,
  GitCompareArrows,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Settings,
  ShieldAlert,
  TriangleAlert,
  Users,
} from "lucide-react";

const navIcons = {
  activity: Activity,
  assistant: Bot,
  audit: ScrollText,
  approvals: ClipboardCheck,
  comparisons: GitCompareArrows,
  conflicts: ShieldAlert,
  dashboard: LayoutDashboard,
  departments: Building2,
  evaluations: Gauge,
  plans: ListChecks,
  policies: FileText,
  risks: TriangleAlert,
  settings: Settings,
  users: Users,
} as const;

export type NavIconName = keyof typeof navIcons;

export function NavLink({ href, label, icon }: { href: string; label: string; icon: NavIconName }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  const Icon = navIcons[icon];
  return <Link href={href} aria-current={active ? "page" : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${active ? "bg-white/11 text-white ring-1 ring-white/10" : "text-emerald-50/68 hover:bg-white/[.07] hover:text-white"}`}><Icon className={`size-[17px] shrink-0 ${active ? "text-emerald-200" : "text-emerald-100/55 group-hover:text-emerald-200"}`} aria-hidden="true" /><span>{label}</span></Link>;
}
