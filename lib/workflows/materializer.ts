import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { generatePolicyReportMarkdown } from "@/lib/reports/markdown";
import { generatePolicyReportPdf } from "@/lib/reports/pdf";

import type { PolicyWorkflowState, WorkflowNodeName } from "./state";

export interface WorkflowMaterializer {
  materialize(
    state: PolicyWorkflowState,
    node: WorkflowNodeName,
  ): Promise<void>;
}

const CHANGE_TYPE_MAP = {
  added_rule: "added",
  removed_rule: "removed",
  modified_rule: "modified",
  deadline_change: "deadline_change",
  responsibility_change: "responsibility_change",
  eligibility_change: "eligibility_change",
  new_exception: "exception_added",
  removed_exception: "exception_removed",
  new_compliance_requirement: "compliance_requirement",
  ambiguous_language: "ambiguous_language",
  missing_implementation_detail: "implementation_gap",
} as const;

function stableUuid(...parts: string[]): string {
  const hex = createHash("sha256")
    .update(parts.join("\u001f"))
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  const variant = Number.parseInt(hex[16] ?? "0", 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function uuidOrNull(value: string | undefined): string | null {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function resolveConfiguredDepartmentId(
  requestedName: string,
  departments: ReadonlyMap<string, string>,
  fallbackIds: readonly string[],
): string | null {
  const exact = departments.get(normalized(requestedName));
  if (exact) return exact;
  const availableIds = new Set(departments.values());
  const validFallbacks = [
    ...new Set(fallbackIds.filter((id) => availableIds.has(id))),
  ];
  return validFallbacks.length === 1 ? (validFallbacks[0] ?? null) : null;
}

export class SupabaseWorkflowMaterializer implements WorkflowMaterializer {
  constructor(private readonly supabase: SupabaseClient) {}

  async materialize(
    state: PolicyWorkflowState,
    node: WorkflowNodeName,
  ): Promise<void> {
    await this.updateComparison(state, node);
    if (!state.comparisonId) return;
    if (node === "revision") await this.clearCurrentAnalysis(state);
    if (node === "change_detection") await this.materializeChanges(state);
    if (node === "conflict_detection") await this.materializeConflicts(state);
    if (node === "risk_assessment") await this.materializeRisks(state);
    if (node === "action_plan") await this.materializeActions(state);
    if (node === "human_approval") await this.materializeApproval(state);
    if (node === "final_report") await this.materializeReport(state);
  }

  private async clearCurrentAnalysis(
    state: PolicyWorkflowState,
  ): Promise<void> {
    if (!state.comparisonId) return;
    for (const table of [
      "risk_assessments",
      "action_plans",
      "policy_conflicts",
      "policy_changes",
    ] as const) {
      const { error } = await this.supabase
        .from(table)
        .delete()
        .eq("comparison_id", state.comparisonId)
        .eq("organization_id", state.organizationId);
      if (error)
        throw new Error(
          `Unable to clear superseded ${table}: ${error.message}`,
        );
    }
  }

  private async departments(
    state: PolicyWorkflowState,
  ): Promise<Map<string, string>> {
    const { data, error } = await this.supabase
      .from("departments")
      .select("id,name")
      .eq("organization_id", state.organizationId);
    if (error)
      throw new Error(
        `Unable to resolve workflow departments: ${error.message}`,
      );
    return new Map(
      ((data ?? []) as unknown[]).map((row) => {
        const record = row as Record<string, unknown>;
        return [normalized(String(record.name)), String(record.id)];
      }),
    );
  }

  private async updateComparison(
    state: PolicyWorkflowState,
    node: WorkflowNodeName,
  ): Promise<void> {
    if (!state.comparisonId) return;
    const comparisonStatus =
      state.status === "invalid"
        ? "failed"
        : node === "human_approval"
          ? (state.approvalDecision?.decision ?? "awaiting_approval")
          : node === "quality_review"
            ? "quality_review"
            : node === "final_report"
              ? "completed"
              : "processing";
    const { error } = await this.supabase
      .from("policy_comparisons")
      .update({
        status: comparisonStatus,
        analysis_version: state.analysisVersion,
        executive_summary: state.report?.executiveSummary ?? null,
        overall_risk: state.riskAssessment?.overallRisk ?? null,
        overall_confidence: state.riskAssessment?.confidence ?? null,
        quality_score: state.qualityReview?.qualityScore ?? null,
        revision_count: Math.min(
          state.automaticRevisionCount,
          state.maxAutomaticRevisions,
        ),
        started_at: state.startedAt,
        completed_at: state.completedAt,
        failure_reason:
          state.status === "invalid" ? state.errors.join("; ") : null,
        updated_at: state.updatedAt,
      })
      .eq("id", state.comparisonId)
      .eq("organization_id", state.organizationId);
    if (error)
      throw new Error(
        `Unable to materialize comparison progress: ${error.message}`,
      );
  }

  private async materializeChanges(state: PolicyWorkflowState): Promise<void> {
    if (!state.comparisonId || !state.changeDetection) return;
    const { error: deleteError } = await this.supabase
      .from("policy_changes")
      .delete()
      .eq("comparison_id", state.comparisonId)
      .eq("organization_id", state.organizationId);
    if (deleteError)
      throw new Error(
        `Unable to replace policy changes: ${deleteError.message}`,
      );
    const departments = await this.departments(state);
    const rows = state.changeDetection.changes.map((change) => ({
      id: stableUuid(state.comparisonId as string, "change", change.id),
      organization_id: state.organizationId,
      comparison_id: state.comparisonId,
      department_id: departments.get(normalized(change.department)) ?? null,
      old_chunk_id: uuidOrNull(change.oldCitation?.chunkId),
      new_chunk_id: uuidOrNull(change.newCitation?.chunkId),
      change_type: CHANGE_TYPE_MAP[change.changeType],
      old_text: change.oldText,
      new_text: change.newText,
      explanation: change.explanation,
      impact: change.impact,
      risk_level: change.riskLevel,
      confidence: change.confidence,
      old_citation: change.oldCitation,
      new_citation: change.newCitation,
      updated_at: state.updatedAt,
    }));
    if (!rows.length) return;
    const { error } = await this.supabase
      .from("policy_changes")
      .upsert(rows, { onConflict: "id" });
    if (error)
      throw new Error(`Unable to materialize policy changes: ${error.message}`);
  }

  private async materializeConflicts(
    state: PolicyWorkflowState,
  ): Promise<void> {
    if (!state.comparisonId || !state.conflictDetection) return;
    const { error: deleteError } = await this.supabase
      .from("policy_conflicts")
      .delete()
      .eq("comparison_id", state.comparisonId)
      .eq("organization_id", state.organizationId);
    if (deleteError)
      throw new Error(
        `Unable to replace policy conflicts: ${deleteError.message}`,
      );
    const departments = await this.departments(state);
    const rows = state.conflictDetection.conflicts.map((conflict) => {
      const left = conflict.citations[0];
      const right = conflict.citations.find(
        (citation) => citation.documentId !== left?.documentId,
      );
      if (!left || !right) {
        throw new Error(
          `Conflict ${conflict.id} does not cite two distinct policy documents`,
        );
      }
      return {
        id: stableUuid(state.comparisonId as string, "conflict", conflict.id),
        organization_id: state.organizationId,
        comparison_id: state.comparisonId,
        department_id:
          departments.get(normalized(conflict.affectedDepartments[0] ?? "")) ??
          null,
        left_document_id: left.documentId,
        right_document_id: right.documentId,
        conflict_type: conflict.conflictType,
        left_text: conflict.firstPosition,
        right_text: conflict.secondPosition,
        explanation: conflict.statement,
        risk_level: conflict.riskLevel,
        confidence: conflict.confidence,
        left_citation: left,
        right_citation: right,
        resolution: conflict.resolutionSuggestion,
        updated_at: state.updatedAt,
      };
    });
    if (!rows.length) return;
    const { error } = await this.supabase
      .from("policy_conflicts")
      .upsert(rows, { onConflict: "id" });
    if (error)
      throw new Error(
        `Unable to materialize policy conflicts: ${error.message}`,
      );
  }

  private async materializeRisks(state: PolicyWorkflowState): Promise<void> {
    if (!state.comparisonId || !state.riskAssessment) return;
    const { error: deleteError } = await this.supabase
      .from("risk_assessments")
      .delete()
      .eq("comparison_id", state.comparisonId)
      .eq("organization_id", state.organizationId);
    if (deleteError)
      throw new Error(
        `Unable to replace risk assessments: ${deleteError.message}`,
      );
    const departments = await this.departments(state);
    const changeIds = new Set(
      state.changeDetection?.changes.map((change) => change.id) ?? [],
    );
    const conflictIds = new Set(
      state.conflictDetection?.conflicts.map((conflict) => conflict.id) ?? [],
    );
    const rows = state.riskAssessment.risks.map((risk) => {
      const changeId = risk.sourceFindingIds.find((id) => changeIds.has(id));
      const conflictId = risk.sourceFindingIds.find((id) =>
        conflictIds.has(id),
      );
      return {
        id: stableUuid(state.comparisonId as string, "risk", risk.id),
        organization_id: state.organizationId,
        comparison_id: state.comparisonId,
        policy_change_id: changeId
          ? stableUuid(state.comparisonId as string, "change", changeId)
          : null,
        policy_conflict_id:
          changeId || !conflictId
            ? null
            : stableUuid(state.comparisonId as string, "conflict", conflictId),
        department_id: departments.get(normalized(risk.department)) ?? null,
        dimension: "compliance",
        risk_level: risk.level,
        score: Number(
          (((risk.likelihood + risk.severity) / 2) * 100).toFixed(2),
        ),
        likelihood: Number((risk.likelihood * 100).toFixed(2)),
        impact_score: Number((risk.severity * 100).toFixed(2)),
        rationale: risk.rationale,
        mitigation: risk.mitigations.join("; ") || null,
        evidence: risk.citations,
        updated_at: state.updatedAt,
      };
    });
    if (!rows.length) return;
    const { error } = await this.supabase
      .from("risk_assessments")
      .upsert(rows, { onConflict: "id" });
    if (error)
      throw new Error(
        `Unable to materialize risk assessments: ${error.message}`,
      );
  }

  private async materializeActions(state: PolicyWorkflowState): Promise<void> {
    if (!state.comparisonId || !state.actionPlan) return;
    const { error: deleteError } = await this.supabase
      .from("action_plans")
      .delete()
      .eq("comparison_id", state.comparisonId)
      .eq("organization_id", state.organizationId);
    if (deleteError)
      throw new Error(`Unable to replace action plans: ${deleteError.message}`);
    const departments = await this.departments(state);
    const sharedDocumentDepartment =
      state.oldDocument.departmentId === state.newDocument.departmentId
        ? state.oldDocument.departmentId
        : null;
    const knownDepartmentIds = state.knownDepartments.flatMap((name) => {
      const id = departments.get(normalized(name));
      return id ? [id] : [];
    });
    const organizationDepartmentIds = [...new Set(departments.values())];
    const fallbackIds = sharedDocumentDepartment
      ? [sharedDocumentDepartment]
      : knownDepartmentIds.length > 0
        ? knownDepartmentIds
        : organizationDepartmentIds.length === 1
          ? organizationDepartmentIds
          : [];
    const grouped = new Map<string, typeof state.actionPlan.actions>();
    for (const action of state.actionPlan.actions) {
      const departmentId = resolveConfiguredDepartmentId(
        action.department,
        departments,
        fallbackIds,
      );
      if (!departmentId) {
        throw new Error(
          `Action-plan department is not configured: ${action.department}`,
        );
      }
      grouped.set(departmentId, [...(grouped.get(departmentId) ?? []), action]);
    }
    for (const [departmentId, actions] of grouped) {
      const configuredName =
        state.knownDepartments.find(
          (name) => departments.get(normalized(name)) === departmentId,
        ) ??
        actions[0]?.department ??
        "Department";
      const planId = stableUuid(
        state.comparisonId,
        "action-plan",
        departmentId,
      );
      const { error: planError } = await this.supabase
        .from("action_plans")
        .upsert(
          {
            id: planId,
            organization_id: state.organizationId,
            comparison_id: state.comparisonId,
            department_id: departmentId,
            title: `${configuredName} policy implementation plan`,
            summary: actions.map((action) => action.description).join(" "),
            priority: actions.some((action) => action.priority === "critical")
              ? "critical"
              : actions.some((action) => action.priority === "high")
                ? "high"
                : actions.some((action) => action.priority === "medium")
                  ? "medium"
                  : "low",
            updated_at: state.updatedAt,
          },
          { onConflict: "comparison_id,department_id" },
        );
      if (planError)
        throw new Error(
          `Unable to materialize an action plan: ${planError.message}`,
        );
      const items = actions.map((action, index) => ({
        id: stableUuid(state.comparisonId as string, "action-item", action.id),
        organization_id: state.organizationId,
        action_plan_id: planId,
        title: action.title,
        description: [
          action.description,
          `Owner role: ${action.ownerRole}.`,
          `Timing: ${action.dueDateGuidance}.`,
          `Completion criteria: ${action.completionCriteria.join("; ")}.`,
        ].join(" "),
        sequence_number: index + 1,
        updated_at: state.updatedAt,
      }));
      const { error: itemError } = await this.supabase
        .from("action_items")
        .upsert(items, { onConflict: "id" });
      if (itemError)
        throw new Error(
          `Unable to materialize action items: ${itemError.message}`,
        );
    }
  }

  private async materializeReport(state: PolicyWorkflowState): Promise<void> {
    if (!state.comparisonId) return;
    const reportInput = {
      state,
      generatedAt: state.completedAt ?? state.updatedAt,
      generatedBy: "PolicyPulse AI workflow",
      evaluation: [],
    };
    const content = generatePolicyReportMarkdown(reportInput);
    const { error } = await this.supabase.from("reports").upsert(
      {
        id: stableUuid(
          state.comparisonId,
          "report",
          String(state.analysisVersion),
          "markdown",
        ),
        organization_id: state.organizationId,
        comparison_id: state.comparisonId,
        generated_by: state.requestedBy,
        format: "markdown",
        title:
          state.report?.title ?? "Policy Change Impact and Compliance Report",
        content,
        content_sha256: createHash("sha256").update(content).digest("hex"),
        generation_version: state.analysisVersion,
        updated_at: state.updatedAt,
      },
      { onConflict: "id" },
    );
    if (error)
      throw new Error(
        `Unable to materialize the Markdown report: ${error.message}`,
      );

    const pdf = Buffer.from(await generatePolicyReportPdf(reportInput));
    const storagePath = `${state.organizationId}/reports/${state.comparisonId}/v${state.analysisVersion}.pdf`;
    const { error: storageError } = await this.supabase.storage
      .from("policy-documents")
      .upload(storagePath, pdf, {
        contentType: "application/pdf",
        cacheControl: "0",
        upsert: true,
      });
    if (storageError) {
      throw new Error(
        `Unable to store the PDF report: ${storageError.message}`,
      );
    }
    const { error: pdfError } = await this.supabase.from("reports").upsert(
      {
        id: stableUuid(
          state.comparisonId,
          "report",
          String(state.analysisVersion),
          "pdf",
        ),
        organization_id: state.organizationId,
        comparison_id: state.comparisonId,
        generated_by: state.requestedBy,
        format: "pdf",
        title:
          state.report?.title ?? "Policy Change Impact and Compliance Report",
        storage_bucket: "policy-documents",
        storage_path: storagePath,
        content_sha256: createHash("sha256").update(pdf).digest("hex"),
        generation_version: state.analysisVersion,
        updated_at: state.updatedAt,
      },
      { onConflict: "id" },
    );
    if (pdfError)
      throw new Error(
        `Unable to materialize the PDF report: ${pdfError.message}`,
      );
  }

  private async materializeApproval(state: PolicyWorkflowState): Promise<void> {
    if (!state.comparisonId || !state.approvalRequest) return;
    const requestId = stableUuid(
      state.comparisonId,
      "approval-request",
      String(state.approvalRequest.analysisVersion),
    );
    const { data: existing, error: existingError } = await this.supabase
      .from("approval_requests")
      .select("id,status")
      .eq("id", requestId)
      .eq("organization_id", state.organizationId)
      .maybeSingle();
    if (existingError) {
      throw new Error(
        `Unable to check the approval request: ${existingError.message}`,
      );
    }
    // Resuming a LangGraph interrupt re-enters this node. Never upsert a
    // resolved request back to pending; the transactional decision RPC owns
    // status changes and the append-only decision row.
    if (existing) return;
    const { error: requestError } = await this.supabase
      .from("approval_requests")
      .insert({
        id: requestId,
        organization_id: state.organizationId,
        comparison_id: state.comparisonId,
        workflow_run_id: state.runId,
        requested_by: state.requestedBy,
        status: "pending",
        risk_level:
          state.approvalRequest.overallRisk === "high" ||
          state.approvalRequest.overallRisk === "critical"
            ? state.approvalRequest.overallRisk
            : null,
        reason: state.approvalRequest.reason,
        analysis_version: state.approvalRequest.analysisVersion,
        updated_at: state.updatedAt,
      });
    if (requestError)
      throw new Error(
        `Unable to materialize approval request: ${requestError.message}`,
      );
    // record_approval_decision(...) is the sole append-only decision writer. The
    // workflow only reflects that authoritative row into resumable graph state.
  }
}
