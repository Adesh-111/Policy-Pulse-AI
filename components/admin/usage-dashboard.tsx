"use client";

import { useState } from "react";
import { Activity, Coins, Gauge, Search, Timer, Zap } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  arrayValue,
  firstString,
  formatDate,
  numberValue,
  type ApiRecord,
} from "@/components/api";
import { useApi } from "@/components/hooks/use-api";
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionCard,
  StatCard,
  statusTone,
} from "@/components/ui";

export function UsageDashboard() {
  const { data, loading, error, refresh } = useApi("/api/v1/usage");
  const [query, setQuery] = useState("");
  const logs = arrayValue<ApiRecord>(data, ["usage", "logs", "calls"]);
  const filtered = logs.filter((item) =>
    [
      "model",
      "operation",
      "status",
      "user_email",
      "user_id",
      "workflow_run_id",
      "workflow_id",
      "error_type",
    ]
      .map((key) => firstString(item, [key], ""))
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const totalTokens = logs.reduce(
    (sum, item) =>
      sum +
      numberValue(
        item.total_tokens,
        numberValue(item.input_tokens) + numberValue(item.output_tokens),
      ),
    0,
  );
  const totalCost = logs.reduce(
    (sum, item) =>
      sum + numberValue(item.estimated_cost ?? item.estimated_cost_usd),
    0,
  );
  const averageLatency = logs.length
    ? logs.reduce((sum, item) => sum + numberValue(item.latency_ms), 0) /
      logs.length
    : 0;
  const chart = (() => {
    const grouped = new Map<
      string,
      { date: string; cost: number; tokens: number; calls: number }
    >();
    for (const log of logs) {
      const raw = firstString(log, ["created_at", "timestamp"], "");
      const date = raw ? new Date(raw).toISOString().slice(0, 10) : "Unknown";
      const point = grouped.get(date) ?? { date, cost: 0, tokens: 0, calls: 0 };
      point.cost += numberValue(log.estimated_cost ?? log.estimated_cost_usd);
      point.tokens += numberValue(
        log.total_tokens,
        numberValue(log.input_tokens) + numberValue(log.output_tokens),
      );
      point.calls += 1;
      grouped.set(date, point);
    }
    return [...grouped.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
  })();
  if (loading && !data)
    return (
      <SectionCard>
        <LoadingState label="Loading OpenAI telemetry…" rows={7} />
      </SectionCard>
    );
  if (error && !data)
    return (
      <SectionCard>
        <ErrorState message={error} onRetry={refresh} />
      </SectionCard>
    );
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tracked calls"
          value={logs.length.toLocaleString()}
          detail="Across all recorded operations"
          icon={Zap}
        />
        <StatCard
          label="Total tokens"
          value={totalTokens.toLocaleString()}
          detail="Input plus output tokens"
          icon={Activity}
          tone="blue"
        />
        <StatCard
          label="Estimated cost"
          value={`$${totalCost.toFixed(4)}`}
          detail="Based on recorded model pricing"
          icon={Coins}
          tone="amber"
        />
        <StatCard
          label="Average latency"
          value={`${Math.round(averageLatency).toLocaleString()} ms`}
          detail="End-to-end provider call time"
          icon={Timer}
          tone="rose"
        />
      </div>
      {!logs.length ? (
        <SectionCard>
          <EmptyState
            icon={Gauge}
            title="No OpenAI usage has been recorded"
            description="Model calls will appear here after document ingestion, retrieval, analysis, chat, reporting, or evaluation runs execute."
          />
        </SectionCard>
      ) : (
        <>
          <SectionCard
            title="Usage trend"
            description="Daily token volume and estimated cost from recorded calls."
          >
            <div className="h-[320px] p-4 sm:p-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chart}
                  margin={{ top: 8, right: 10, left: -15, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d684d" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0d684d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e5e9e6"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#718079" }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#718079" }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      borderColor: "#dce3df",
                      fontSize: 11,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    stroke="#0d684d"
                    fill="url(#tokenFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
          <SectionCard
            title="Call log"
            description="Model, operation, token use, cost, latency, status, and attribution for each OpenAI operation."
            action={
              <label className="relative">
                <span className="sr-only">Search usage logs</span>
                <Search className="absolute left-3 top-2.5 size-3.5 text-[#89938e]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-8 w-56 rounded-lg border bg-[#fafbf9] pl-8 pr-2 text-[11px]"
                  placeholder="Search calls…"
                />
              </label>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] text-left">
                <thead className="bg-[#fafbf9] text-[9px] font-bold uppercase tracking-[0.1em] text-[#7c8782]">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-3 py-3">Operation</th>
                    <th className="px-3 py-3">Model</th>
                    <th className="px-3 py-3">User</th>
                    <th className="px-3 py-3">Workflow</th>
                    <th className="px-3 py-3">Input</th>
                    <th className="px-3 py-3">Output</th>
                    <th className="px-3 py-3">Cost</th>
                    <th className="px-3 py-3">Latency</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0ee]">
                  {filtered.map((log, index) => {
                    const status = firstString(log, ["status"], "unknown");
                    return (
                      <tr
                        key={firstString(log, ["id"], String(index))}
                        className="text-[11px]"
                      >
                        <td className="px-5 py-3.5 text-[#6c7872]">
                          {formatDate(log.created_at ?? log.timestamp, true)}
                        </td>
                        <td className="px-3 py-3.5 font-semibold capitalize">
                          {firstString(
                            log,
                            ["operation"],
                            "Unknown",
                          ).replaceAll("_", " ")}
                        </td>
                        <td className="px-3 py-3.5 font-mono text-[10px]">
                          {firstString(log, ["model"], "—")}
                        </td>
                        <td className="max-w-36 truncate px-3 py-3.5 font-mono text-[10px]">
                          {firstString(
                            log,
                            ["user_email", "user_id"],
                            "service",
                          )}
                        </td>
                        <td className="max-w-36 truncate px-3 py-3.5 font-mono text-[10px]">
                          {firstString(log, ["workflow_run_id", "workflow_id"], "—")}
                        </td>
                        <td className="px-3 py-3.5 font-mono">
                          {numberValue(log.input_tokens).toLocaleString()}
                        </td>
                        <td className="px-3 py-3.5 font-mono">
                          {numberValue(log.output_tokens).toLocaleString()}
                        </td>
                        <td className="px-3 py-3.5 font-mono">
                          $
                          {numberValue(
                            log.estimated_cost ?? log.estimated_cost_usd,
                          ).toFixed(5)}
                        </td>
                        <td className="px-3 py-3.5 font-mono">
                          {numberValue(log.latency_ms).toLocaleString()} ms
                        </td>
                        <td className="px-3 py-3.5">
                          <Badge tone={statusTone(status)}>{status}</Badge>
                        </td>
                        <td className="max-w-44 px-3 py-3.5 text-rose-700">
                          {firstString(log, ["error_type"], "—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
