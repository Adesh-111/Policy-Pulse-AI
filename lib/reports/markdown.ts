import type { Citation } from "@/lib/ai";

import type { PolicyReportInput } from "./types";

function tableCell(value: unknown): string {
  return String(value ?? "\u2014").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function riskLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function collectCitations(input: PolicyReportInput): Citation[] {
  const state = input.state;
  const citations: Citation[] = [...state.evidence];
  for (const change of state.changeDetection?.changes ?? []) {
    if (change.oldCitation) citations.push(change.oldCitation);
    if (change.newCitation) citations.push(change.newCitation);
  }
  for (const conflict of state.conflictDetection?.conflicts ?? []) citations.push(...conflict.citations);
  for (const impact of state.impactAnalysis?.impacts ?? []) citations.push(...impact.citations);
  for (const risk of state.riskAssessment?.risks ?? []) citations.push(...risk.citations);
  for (const action of state.actionPlan?.actions ?? []) citations.push(...action.citations);
  return [...new Map(citations.map((citation) => [citation.chunkId, citation])).values()];
}

function metric(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function generatePolicyReportMarkdown(input: PolicyReportInput): string {
  const { state } = input;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const citations = collectCitations(input);
  const citationIndex = new Map(citations.map((citation, index) => [citation.chunkId, index + 1]));
  const citationRef = (citation: Citation | null) =>
    citation ? `[C${citationIndex.get(citation.chunkId) ?? "?"}]` : "\u2014";
  const lines: string[] = [];

  lines.push(`# ${state.report?.title ?? "Policy Change Impact and Compliance Report"}`);
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(
    state.report?.executiveSummary ??
      "The workflow did not produce an executive summary. Review the validation and evidence status before relying on this report.",
  );
  if (state.report?.caveats.length) {
    lines.push("");
    lines.push("### Caveats");
    lines.push("");
    for (const caveat of state.report.caveats) lines.push(`- ${caveat}`);
  }

  lines.push("");
  lines.push("## Compared Documents");
  lines.push("");
  lines.push("| Designation | Document | Version | Effective date | Category |");
  lines.push("|---|---|---|---|---|");
  for (const document of [state.oldDocument, state.newDocument]) {
    lines.push(
      `| ${tableCell(document.designation)} | ${tableCell(document.title)} | ${tableCell(document.version)} | ${tableCell(document.effectiveDate)} | ${tableCell(document.category)} |`,
    );
  }

  lines.push("");
  lines.push("## Important Changes");
  lines.push("");
  const changes = state.changeDetection?.changes ?? [];
  if (changes.length === 0) {
    lines.push("No evidence-backed material changes were recorded.");
  } else {
    lines.push("| Type | Department | Risk | Explanation | Old source | New source |");
    lines.push("|---|---|---|---|---|---|");
    for (const change of changes) {
      lines.push(
        `| ${tableCell(change.changeType)} | ${tableCell(change.department)} | ${riskLabel(change.riskLevel)} | ${tableCell(change.explanation)} | ${citationRef(change.oldCitation)} | ${citationRef(change.newCitation)} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Conflicts");
  lines.push("");
  const conflicts = state.conflictDetection?.conflicts ?? [];
  if (conflicts.length === 0) {
    lines.push("No evidence-backed cross-policy conflicts were recorded.");
  } else {
    for (const conflict of conflicts) {
      lines.push(`### ${conflict.statement}`);
      lines.push("");
      lines.push(`- Type: ${conflict.conflictType}`);
      lines.push(`- Risk: ${riskLabel(conflict.riskLevel)}`);
      lines.push(`- First position: ${conflict.firstPosition}`);
      lines.push(`- Second position: ${conflict.secondPosition}`);
      lines.push(`- Affected departments: ${conflict.affectedDepartments.join(", ") || "Not established"}`);
      lines.push(`- Resolution: ${conflict.resolutionSuggestion}`);
      lines.push(`- Evidence: ${conflict.citations.map(citationRef).join(", ")}`);
      lines.push("");
    }
  }

  lines.push("## Affected Departments");
  lines.push("");
  const impacts = state.impactAnalysis?.impacts ?? [];
  if (impacts.length === 0) {
    lines.push("No department impact was established from the available evidence.");
  } else {
    lines.push("| Department | Urgency | Operational impact | Systems impact | Evidence |");
    lines.push("|---|---|---|---|---|");
    for (const impact of impacts) {
      lines.push(
        `| ${tableCell(impact.department)} | ${tableCell(impact.urgency)} | ${tableCell(impact.operationalImpact)} | ${tableCell(impact.systemsImpact)} | ${impact.citations.map(citationRef).join(", ")} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Risk Assessment");
  lines.push("");
  lines.push(`Overall risk: **${riskLabel(state.riskAssessment?.overallRisk ?? "not assessed")}**`);
  lines.push("");
  const risks = state.riskAssessment?.risks ?? [];
  if (risks.length === 0) {
    lines.push("No evidence-backed risk findings were recorded.");
  } else {
    lines.push("| Department | Level | Likelihood | Severity | Rationale | Mitigation | Evidence |");
    lines.push("|---|---|---:|---:|---|---|---|");
    for (const risk of risks) {
      lines.push(
        `| ${tableCell(risk.department)} | ${riskLabel(risk.level)} | ${metric(risk.likelihood)} | ${metric(risk.severity)} | ${tableCell(risk.rationale)} | ${tableCell(risk.mitigations.join("; "))} | ${risk.citations.map(citationRef).join(", ")} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Department Action Plan");
  lines.push("");
  const actions = state.actionPlan?.actions ?? [];
  if (actions.length === 0) {
    lines.push("No actions were generated from supported findings.");
  } else {
    for (const action of actions) {
      lines.push(`### ${action.department}: ${action.title}`);
      lines.push("");
      lines.push(action.description);
      lines.push("");
      lines.push(`- Owner role: ${action.ownerRole}`);
      lines.push(`- Priority: ${riskLabel(action.priority)}`);
      lines.push(`- Timing: ${action.dueDateGuidance}`);
      lines.push(`- Dependencies: ${action.dependencies.join(", ") || "None recorded"}`);
      lines.push(`- Completion criteria: ${action.completionCriteria.join("; ")}`);
      lines.push(`- Evidence: ${action.citations.map(citationRef).join(", ")}`);
      lines.push("");
    }
  }

  lines.push("## Approval History");
  lines.push("");
  if (state.approvalHistory.length === 0) {
    lines.push("Human approval was not required or has not yet been recorded.");
  } else {
    lines.push("| Decision | Reviewer | Notes | Analysis version | Timestamp |");
    lines.push("|---|---|---|---:|---|");
    for (const approval of state.approvalHistory) {
      lines.push(
        `| ${tableCell(approval.decision)} | ${tableCell(approval.reviewerId)} | ${tableCell(approval.notes)} | ${approval.analysisVersion} | ${tableCell(approval.decidedAt)} |`,
      );
    }
  }

  lines.push("");
  lines.push("## Evidence and Citations");
  lines.push("");
  if (citations.length === 0) {
    lines.push("No sufficient policy evidence was available.");
  } else {
    citations.forEach((citation, index) => {
      const location = [
        citation.pageNumber === null ? null : `page ${citation.pageNumber}`,
        citation.sectionHeading,
      ].filter(Boolean).join(", ");
      lines.push(`### [C${index + 1}] ${citation.documentTitle} (version ${citation.version})`);
      lines.push("");
      lines.push(`Location: ${location || "not available"}`);
      lines.push("");
      lines.push(`> ${citation.evidenceSnippet.replace(/\n/g, "\n> ")}`);
      lines.push("");
    });
  }

  lines.push("## Evaluation Results");
  lines.push("");
  if (!input.evaluation?.length) {
    lines.push("No evaluation run was attached to this report.");
  } else {
    lines.push("| Mode | Questions | Precision | Recall | Faithfulness | Citation correctness | Unsupported claims | Avg. latency |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
    for (const evaluation of input.evaluation) {
      lines.push(
        `| ${tableCell(evaluation.mode)} | ${evaluation.questionCount} | ${metric(evaluation.metrics.retrievalPrecision)} | ${metric(evaluation.metrics.retrievalRecall)} | ${metric(evaluation.metrics.faithfulness)} | ${metric(evaluation.metrics.citationCorrectness)} | ${metric(evaluation.metrics.unsupportedClaimRate)} | ${Math.round(evaluation.metrics.latencyMs)} ms |`,
      );
    }
  }

  lines.push("");
  lines.push("## Report Metadata");
  lines.push("");
  lines.push(`- Workflow run: ${state.runId}`);
  lines.push(`- Analysis version: ${state.analysisVersion}`);
  lines.push(`- Quality score: ${state.qualityReview ? metric(state.qualityReview.qualityScore) : "Not available"}`);
  lines.push(`- Workflow status: ${state.status}`);
  lines.push(`- Generated by: ${input.generatedBy ?? "PolicyPulse AI"}`);
  lines.push(`- Timestamp: ${generatedAt}`);
  return `${lines.join("\n").trim()}\n`;
}
