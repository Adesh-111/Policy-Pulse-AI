export default function DashboardLoading() {
  return <div role="status" aria-label="Loading workspace" className="animate-pulse-soft space-y-7"><div><div className="h-3 w-28 rounded bg-[#dfe5e1]" /><div className="mt-4 h-8 w-72 max-w-full rounded-lg bg-[#dce2de]" /><div className="mt-3 h-4 w-[520px] max-w-full rounded bg-[#e6eae7]" /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 rounded-2xl border bg-white" />)}</div><div className="h-96 rounded-2xl border bg-white" /></div>;
}
