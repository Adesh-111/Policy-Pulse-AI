import { z } from "zod";

export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const ConfidenceSchema = z.number().min(0).max(1);

export const CitationSchema = z.object({
  chunkId: z.string().min(1),
  documentId: z.string().min(1),
  documentTitle: z.string().min(1),
  version: z.string().min(1),
  pageNumber: z.number().int().positive().nullable(),
  sectionHeading: z.string().min(1).nullable(),
  evidenceSnippet: z.string().min(1),
});

export const ToolTraceSchema = z.object({
  toolUsed: z.string().min(1),
  evidenceFound: z.number().int().min(0),
  decisionSummary: z.string().min(1),
  confidence: ConfidenceSchema,
  finalConclusion: z.string().min(1),
});

export const PolicyRuleSchema = z.object({
  id: z.string().min(1),
  category: z.enum([
    "requirement",
    "prohibition",
    "permission",
    "deadline",
    "eligibility",
    "exception",
    "responsibility",
    "retention",
    "other",
  ]),
  statement: z.string().min(1),
  subject: z.string().min(1),
  obligation: z.string().min(1),
  conditions: z.array(z.string()),
  exceptions: z.array(z.string()),
  deadline: z.string().nullable(),
  responsibleDepartments: z.array(z.string()),
  citation: CitationSchema,
  confidence: ConfidenceSchema,
});

export const ChangeFindingSchema = z.object({
  id: z.string().min(1),
  changeType: z.enum([
    "added_rule",
    "removed_rule",
    "modified_rule",
    "deadline_change",
    "responsibility_change",
    "eligibility_change",
    "new_exception",
    "removed_exception",
    "new_compliance_requirement",
    "ambiguous_language",
    "missing_implementation_detail",
  ]),
  oldText: z.string().nullable(),
  newText: z.string().nullable(),
  explanation: z.string().min(1),
  department: z.string().min(1),
  impact: z.string().min(1),
  riskLevel: RiskLevelSchema,
  confidence: ConfidenceSchema,
  oldCitation: CitationSchema.nullable(),
  newCitation: CitationSchema.nullable(),
});

export const ConflictFindingSchema = z.object({
  id: z.string().min(1),
  conflictType: z.enum([
    "direct_contradiction",
    "scope_overlap",
    "deadline_collision",
    "responsibility_gap",
    "exception_mismatch",
    "ambiguous_interaction",
  ]),
  statement: z.string().min(1),
  firstPosition: z.string().min(1),
  secondPosition: z.string().min(1),
  affectedDepartments: z.array(z.string()),
  resolutionSuggestion: z.string().min(1),
  riskLevel: RiskLevelSchema,
  confidence: ConfidenceSchema,
  citations: z.array(CitationSchema).min(2),
});

export const PolicyAnalystInputSchema = z.object({
  documentId: z.string().min(1),
  documentTitle: z.string().min(1),
  version: z.string().min(1),
  evidence: z.array(CitationSchema).min(1),
});

export const PolicyAnalystOutputSchema = z.object({
  documentSummary: z.string().min(1),
  effectiveDate: z.string().nullable(),
  departments: z.array(z.string()),
  rules: z.array(PolicyRuleSchema),
  ambiguousClauses: z.array(z.string()),
  confidence: ConfidenceSchema,
  trace: ToolTraceSchema,
});

export const RetrievalSpecialistInputSchema = z.object({
  query: z.string().min(1),
  conversationContext: z.array(z.string()),
  allowedDocumentIds: z.array(z.string()),
  allowedDepartmentIds: z.array(z.string()),
  versions: z.array(z.string()),
});

export const RetrievalSpecialistOutputSchema = z.object({
  rewrittenQueries: z.array(z.string().min(1)).min(1).max(5),
  keywords: z.array(z.string()),
  retrievalStrategy: z.enum(["vector", "full_text", "hybrid"]),
  evidence: z.array(CitationSchema),
  sufficientEvidence: z.boolean(),
  evidenceSummary: z.string().min(1),
  confidence: ConfidenceSchema,
  trace: ToolTraceSchema,
});

export const ChangeDetectorInputSchema = z.object({
  oldRules: z.array(PolicyRuleSchema),
  newRules: z.array(PolicyRuleSchema),
  evidence: z.array(CitationSchema),
});

export const ChangeDetectorOutputSchema = z.object({
  changes: z.array(ChangeFindingSchema),
  unchangedRuleIds: z.array(z.string()),
  summary: z.string().min(1),
  confidence: ConfidenceSchema,
  trace: ToolTraceSchema,
});

export const ConflictDetectorInputSchema = z.object({
  rules: z.array(PolicyRuleSchema),
  changes: z.array(ChangeFindingSchema),
  crossPolicyEvidence: z.array(CitationSchema),
});

export const ConflictDetectorOutputSchema = z.object({
  conflicts: z.array(ConflictFindingSchema),
  checkedRulePairs: z.number().int().min(0),
  summary: z.string().min(1),
  confidence: ConfidenceSchema,
  trace: ToolTraceSchema,
});

export const DepartmentImpactSchema = z.object({
  department: z.string().min(1),
  affectedChangeIds: z.array(z.string()),
  affectedConflictIds: z.array(z.string()),
  operationalImpact: z.string().min(1),
  peopleImpact: z.string().min(1),
  systemsImpact: z.string().min(1),
  dependencies: z.array(z.string()),
  urgency: z.enum(["routine", "soon", "immediate"]),
  confidence: ConfidenceSchema,
  citations: z.array(CitationSchema),
});

export const ImpactAnalystInputSchema = z.object({
  changes: z.array(ChangeFindingSchema),
  conflicts: z.array(ConflictFindingSchema),
  knownDepartments: z.array(z.string()),
});

export const ImpactAnalystOutputSchema = z.object({
  impacts: z.array(DepartmentImpactSchema),
  crossDepartmentDependencies: z.array(z.string()),
  summary: z.string().min(1),
  confidence: ConfidenceSchema,
  trace: ToolTraceSchema,
});

export const RiskFindingSchema = z.object({
  id: z.string().min(1),
  sourceFindingIds: z.array(z.string()).min(1),
  department: z.string().min(1),
  level: RiskLevelSchema,
  likelihood: z.number().min(0).max(1),
  severity: z.number().min(0).max(1),
  rationale: z.string().min(1),
  mitigations: z.array(z.string()),
  confidence: ConfidenceSchema,
  citations: z.array(CitationSchema).min(1),
});

export const RiskReviewerInputSchema = z.object({
  changes: z.array(ChangeFindingSchema),
  conflicts: z.array(ConflictFindingSchema),
  impacts: z.array(DepartmentImpactSchema),
});

export const RiskReviewerOutputSchema = z.object({
  risks: z.array(RiskFindingSchema),
  overallRisk: RiskLevelSchema,
  requiresHumanApproval: z.boolean(),
  summary: z.string().min(1),
  confidence: ConfidenceSchema,
  trace: ToolTraceSchema,
});

export const ActionItemSchema = z.object({
  id: z.string().min(1),
  department: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  ownerRole: z.string().min(1),
  dueDateGuidance: z.string().min(1),
  priority: RiskLevelSchema,
  dependencies: z.array(z.string()),
  completionCriteria: z.array(z.string()).min(1),
  sourceFindingIds: z.array(z.string()).min(1),
  citations: z.array(CitationSchema).min(1),
});

export const ActionPlannerInputSchema = z.object({
  changes: z.array(ChangeFindingSchema),
  conflicts: z.array(ConflictFindingSchema),
  impacts: z.array(DepartmentImpactSchema),
  risks: z.array(RiskFindingSchema),
  knownDepartments: z.array(z.string()),
});

export const ActionPlannerOutputSchema = z.object({
  actions: z.array(ActionItemSchema),
  sequencingNotes: z.array(z.string()),
  summary: z.string().min(1),
  confidence: ConfidenceSchema,
  trace: ToolTraceSchema,
});

export const QualityReviewerInputSchema = z.object({
  changes: z.array(ChangeFindingSchema),
  conflicts: z.array(ConflictFindingSchema),
  impacts: z.array(DepartmentImpactSchema),
  risks: z.array(RiskFindingSchema),
  actions: z.array(ActionItemSchema),
  evidence: z.array(CitationSchema),
  priorIssues: z.array(z.string()),
});

export const QualityReviewerOutputSchema = z.object({
  passed: z.boolean(),
  qualityScore: z.number().min(0).max(1),
  citationScore: z.number().min(0).max(1),
  completenessScore: z.number().min(0).max(1),
  evidenceSupportScore: z.number().min(0).max(1),
  riskReasonablenessScore: z.number().min(0).max(1),
  actionSpecificityScore: z.number().min(0).max(1),
  hallucinationCount: z.number().int().min(0),
  missedChanges: z.array(z.string()),
  falseConflicts: z.array(z.string()),
  issues: z.array(z.string()),
  revisionInstructions: z.array(z.string()),
  trace: ToolTraceSchema,
});

export const ReportWriterInputSchema = z.object({
  comparisonTitle: z.string().min(1),
  documentTitles: z.array(z.string()).min(2),
  changes: z.array(ChangeFindingSchema),
  conflicts: z.array(ConflictFindingSchema),
  impacts: z.array(DepartmentImpactSchema),
  risks: z.array(RiskFindingSchema),
  actions: z.array(ActionItemSchema),
  quality: QualityReviewerOutputSchema,
  approvalSummary: z.string(),
});

export const ReportWriterOutputSchema = z.object({
  title: z.string().min(1),
  executiveSummary: z.string().min(1),
  importantChangeIds: z.array(z.string()),
  importantConflictIds: z.array(z.string()),
  affectedDepartments: z.array(z.string()),
  conclusion: z.string().min(1),
  caveats: z.array(z.string()),
  confidence: ConfidenceSchema,
  trace: ToolTraceSchema,
});

export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type ChangeFinding = z.infer<typeof ChangeFindingSchema>;
export type ConflictFinding = z.infer<typeof ConflictFindingSchema>;
export type DepartmentImpact = z.infer<typeof DepartmentImpactSchema>;
export type RiskFinding = z.infer<typeof RiskFindingSchema>;
export type ActionItem = z.infer<typeof ActionItemSchema>;
export type QualityReview = z.infer<typeof QualityReviewerOutputSchema>;
