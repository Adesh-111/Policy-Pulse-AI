import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("approval transaction and Row Level Security definitions", () => {
  const rpcSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/202608250004_application_rpcs.sql"),
    "utf8",
  );
  const rlsSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/202608250005_row_level_security.sql"),
    "utf8",
  );

  it("locks and version-checks approval decisions before durable workflow resume", () => {
    expect(rpcSql).toContain("create or replace function public.record_approval_decision");
    expect(rpcSql).toMatch(/where id = p_request_id\s+for update/i);
    expect(rpcSql).toContain("p_expected_analysis_version");
    expect(rpcSql).toContain("approvalResume");
    expect(rpcSql).toContain("approval.decided");
  });

  it("enables RLS and keeps auditor and department mutations restricted", () => {
    expect(rlsSql).toContain(
      "execute format('alter table public.%I enable row level security', v_table)",
    );
    for (const table of ["documents", "approval_decisions", "audit_logs"]) {
      expect(rlsSql).toContain(`'${table}'`);
    }
    const auditorPolicies = rlsSql
      .split(/create policy /i)
      .slice(1)
      .map((block) => block.split(";")[0] ?? "")
      .filter((block) => block.includes("'auditor'"));
    expect(auditorPolicies.length).toBeGreaterThan(0);
    for (const policy of auditorPolicies) expect(policy).toMatch(/for select/i);
    expect(rlsSql).toContain("public.can_access_document");
  });
});
