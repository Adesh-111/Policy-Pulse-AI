import type { BaseCheckpointSaver } from "@langchain/langgraph";
import {
  Command,
  END,
  START,
  StateGraph,
  isGraphInterrupt,
} from "@langchain/langgraph";

import { createWorkflowNodes, type WorkflowNodeServices } from "./nodes";
import {
  routeAfterEvidenceRetrieval,
  routeAfterHumanApproval,
  routeAfterQualityReview,
  routeAfterValidation,
} from "./routing";
import {
  ApprovalResumeSchema,
  PolicyWorkflowAnnotation,
  type ApprovalDecision,
  type PolicyWorkflowState,
  WORKFLOW_NODE_NAMES,
  type WorkflowNodeName,
} from "./state";

export interface CreatePolicyWorkflowOptions {
  services: WorkflowNodeServices;
  checkpointer: BaseCheckpointSaver;
  nodeTimeoutMs?: number;
  nodeMaxAttempts?: number;
  executionMode?: "bounded" | "continuous";
}

export function createPolicyWorkflow(options: CreatePolicyWorkflowOptions) {
  const nodes = createWorkflowNodes(options.services);
  const graph = new StateGraph(PolicyWorkflowAnnotation)
    .addNode(nodes)
    .addEdge(START, "document_validation")
    .addConditionalEdges("document_validation", routeAfterValidation, {
      policy_extraction: "policy_extraction",
      [END]: END,
    })
    .addEdge("policy_extraction", "evidence_retrieval")
    .addConditionalEdges("evidence_retrieval", routeAfterEvidenceRetrieval, {
      evidence_retrieval: "evidence_retrieval",
      change_detection: "change_detection",
      quality_review: "quality_review",
    })
    .addEdge("change_detection", "conflict_detection")
    .addEdge("conflict_detection", "impact_analysis")
    .addEdge("impact_analysis", "risk_assessment")
    .addEdge("risk_assessment", "action_plan")
    .addEdge("action_plan", "quality_review")
    .addConditionalEdges("quality_review", routeAfterQualityReview, {
      revision: "revision",
      human_approval: "human_approval",
      final_report: "final_report",
    })
    .addConditionalEdges("human_approval", routeAfterHumanApproval, {
      revision: "revision",
      final_report: "final_report",
    })
    .addEdge("revision", "evidence_retrieval")
    .addEdge("final_report", END)
    .setNodeDefaults({
      retryPolicy: {
        maxAttempts: options.nodeMaxAttempts ?? 3,
        initialInterval: 500,
        backoffFactor: 2,
        maxInterval: 4_000,
        jitter: true,
        retryOn: (error) => !isGraphInterrupt(error),
      },
      timeout: options.nodeTimeoutMs ?? 55_000,
    });

  return graph.compile({
    checkpointer: options.checkpointer,
    interruptAfter:
      options.executionMode === "continuous"
        ? undefined
        : [...WORKFLOW_NODE_NAMES],
    name: "policypulse_policy_change_workflow",
    description:
      "Durable policy comparison, conflict, impact, risk, action, quality, approval, revision, and reporting workflow.",
  });
}

export type PolicyWorkflowGraph = ReturnType<typeof createPolicyWorkflow>;

export interface AdvancePolicyWorkflowOptions {
  state: PolicyWorkflowState;
  approval?: Pick<ApprovalDecision, "decision" | "reviewerId" | "notes">;
}

export interface AdvancePolicyWorkflowResult {
  state: PolicyWorkflowState;
  nextNodes: WorkflowNodeName[];
  awaitingApproval: boolean;
  completed: boolean;
}

export async function advancePolicyWorkflow(
  graph: PolicyWorkflowGraph,
  options: AdvancePolicyWorkflowOptions,
): Promise<AdvancePolicyWorkflowResult> {
  const config = workflowRunnableConfig(options.state);
  const input = options.approval
    ? approvalResumeCommand(options.approval)
    : options.state.currentNode === null
      ? { workflow: options.state }
      : null;
  const output = await graph.invoke(input as never, config);
  const snapshot = await graph.getState(config);
  const workflow =
    (snapshot.values as { workflow?: PolicyWorkflowState }).workflow ??
    (output as { workflow?: PolicyWorkflowState }).workflow;
  if (!workflow)
    throw new Error("The workflow checkpoint did not contain policy state");
  const nextNodes = snapshot.next.filter((node): node is WorkflowNodeName =>
    (WORKFLOW_NODE_NAMES as readonly string[]).includes(node),
  );
  const awaitingApproval = workflow.status === "awaiting_approval";
  return {
    state: workflow,
    nextNodes,
    awaitingApproval,
    completed:
      workflow.status === "completed" ||
      workflow.status === "invalid" ||
      nextNodes.length === 0,
  };
}

export function workflowRunnableConfig(state: PolicyWorkflowState) {
  return {
    configurable: {
      thread_id: state.threadId,
      organization_id: state.organizationId,
      workflow_run_id: state.runId,
      checkpoint_ns: "",
    },
    recursionLimit: 80,
  };
}

export function approvalResumeCommand(
  input: Pick<ApprovalDecision, "decision" | "reviewerId" | "notes">,
) {
  return new Command({ resume: ApprovalResumeSchema.parse(input) });
}
