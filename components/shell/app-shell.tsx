import type { ReactNode } from "react";
import { Bell, ChevronDown, CircleUserRound, FileClock, Menu, Search, WalletCards } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { logoutAction } from "@/app/(auth)/actions";
import { NavLink } from "@/components/shell/nav-link";
import type { NavIconName } from "@/components/shell/nav-link";

export type Viewer = { name: string; email: string; role: "administrator" | "policy_manager" | "department_user" | "auditor" };

type NavItem = { href: string; label: string; icon: NavIconName };

const workspace: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "dashboard" },
  { href: "/policies", label: "Policy library", icon: "policies" },
  { href: "/comparisons", label: "Comparisons", icon: "comparisons" },
  { href: "/assistant", label: "Policy assistant", icon: "assistant" },
];
const oversight: NavItem[] = [
  { href: "/conflicts", label: "Conflicts", icon: "conflicts" },
  { href: "/risks", label: "Risk dashboard", icon: "risks" },
  { href: "/action-plans", label: "Action plans", icon: "plans" },
  { href: "/approvals", label: "Approval queue", icon: "approvals" },
  { href: "/evaluations", label: "Evaluations", icon: "evaluations" },
];
const administration: NavItem[] = [
  { href: "/admin/usage", label: "OpenAI usage", icon: "activity" },
  { href: "/admin/audit", label: "Audit logs", icon: "audit" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/departments", label: "Departments", icon: "departments" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return <div className="mt-6"><p className="px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-100/35">{label}</p><nav className="mt-2 space-y-0.5" aria-label={label}>{items.map((item) => <NavLink key={item.href} {...item} />)}</nav></div>;
}

function RoleName({ role }: { role: Viewer["role"] }) {
  return <>{role === "administrator" ? "Administrator" : role === "policy_manager" ? "Policy manager" : role === "department_user" ? "Department user" : "Auditor"}</>;
}

function Navigation({ viewer }: { viewer: Viewer }) {
  const allowedOversight: NavItem[] = viewer.role === "department_user" ? oversight.filter((item) => item.href === "/action-plans") : viewer.role === "auditor" ? [...oversight, { href: "/admin/audit", label: "Audit logs", icon: "audit" }] : oversight;
  return <><NavGroup label="Workspace" items={workspace} /><NavGroup label="Oversight" items={allowedOversight} />{viewer.role === "administrator" && <NavGroup label="Administration" items={administration} />}</>;
}

export function AppShell({ children, viewer }: { children: ReactNode; viewer: Viewer }) {
  const initials = viewer.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "PP";
  return (
    <div className="min-h-screen bg-[#f5f6f3] lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col overflow-y-auto bg-[#0b3025] px-3 py-5 text-white lg:flex">
        <div className="px-2"><Brand inverse /></div><div className="mt-5 h-px bg-white/8" /><Navigation viewer={viewer} />
        <div className="mt-auto pt-6"><div className="rounded-2xl border border-white/10 bg-white/[.055] p-3"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-200 text-xs font-bold text-[#0b4c39]">{initials}</span><div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{viewer.name}</p><p className="mt-0.5 text-[10px] text-emerald-100/55"><RoleName role={viewer.role} /></p></div></div><form action={logoutAction}><button className="mt-3 w-full rounded-lg border border-white/10 px-3 py-2 text-left text-[11px] font-semibold text-emerald-50/70 hover:bg-white/[.07] hover:text-white" type="submit">Sign out</button></form></div></div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="no-print sticky top-0 z-20 flex h-[66px] items-center justify-between border-b border-[#dfe5e1] bg-white/92 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden"><details className="group relative"><summary className="grid size-10 list-none place-items-center rounded-xl border border-[#dce3df] bg-white text-[#415049]"><Menu className="size-5" /><span className="sr-only">Open navigation</span></summary><div className="absolute left-0 top-12 w-72 max-h-[calc(100vh-90px)] overflow-auto rounded-2xl bg-[#0b3025] p-3 text-white shadow-2xl"><div className="px-2 py-2"><Brand inverse /></div><Navigation viewer={viewer} /><form action={logoutAction}><button className="mt-5 w-full rounded-xl border border-white/10 px-3 py-2.5 text-left text-xs text-emerald-100/70">Sign out</button></form></div></details><span className="sm:hidden"><Brand compact /></span></div>
          <div className="hidden items-center gap-2 text-xs text-[#78837e] sm:flex"><FileClock className="size-4 text-[#0d684d]" /><span>Policy intelligence workspace</span></div>
          <div className="flex items-center gap-1.5"><Link href="/assistant" className="hidden h-9 items-center gap-2 rounded-xl border border-[#dce3df] bg-[#fafbf9] px-3 text-xs font-medium text-[#68756f] hover:border-[#c7d1cc] sm:inline-flex"><Search className="size-3.5" />Ask a policy question</Link>{viewer.role !== "department_user" && <Link href="/approvals" className="grid size-9 place-items-center rounded-xl text-[#64716b] hover:bg-[#eef2ef]" aria-label="Approval notifications"><Bell className="size-[18px]" /></Link>}<details className="relative"><summary className="flex list-none items-center gap-2 rounded-xl p-1.5 hover:bg-[#eef2ef]"><span className="grid size-7 place-items-center rounded-lg bg-[#dcefe7] text-[10px] font-bold text-[#0d684d]">{initials}</span><ChevronDown className="hidden size-3.5 text-[#77827d] sm:block" /><span className="sr-only">Account menu</span></summary><div className="absolute right-0 top-11 w-64 rounded-2xl border border-[#dfe5e1] bg-white p-2 shadow-xl"><div className="border-b border-[#edf0ee] px-3 py-2.5"><p className="truncate text-xs font-semibold">{viewer.name}</p><p className="mt-1 truncate text-[10px] text-[#7b8681]">{viewer.email}</p></div>{viewer.role === "administrator" ? <Link href="/admin/settings" className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#4e5c56] hover:bg-[#f2f5f2]"><CircleUserRound className="size-4" />System settings</Link> : <div className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#68756f]"><CircleUserRound className="size-4" /><RoleName role={viewer.role} /></div>}<form action={logoutAction}><button type="submit" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#4e5c56] hover:bg-[#f2f5f2]"><WalletCards className="size-4" />Sign out</button></form></div></details></div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8 xl:p-10">{children}</main>
      </div>
    </div>
  );
}
