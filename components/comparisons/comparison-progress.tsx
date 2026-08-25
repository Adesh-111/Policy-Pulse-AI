"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleDot,
  Clock3,
  GitBranch,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  firstString,
  isRecord,
  numberValue,
  recordValue,
} from "@/components/api";
import { useApi } from "@/components/hooks/use-api";
import {
  Badge,
  ButtonLink,
  ErrorState,
  LoadingState,
  SectionCard,
  secondaryButtonClass,
  statusTone,
} from "@/components/ui";

const nodes = [
  {
    key: "document_validation",
    label: "Document validation",
    text: "Verify type, metadata, integrity, and policy scope.",
  },
  {
    key: "policy_extraction",
    label: "Policy extraction",
    text: "Identify rules, sections, responsibilities, and deadlines.",
  },
  {
    key: "evidence_retrieval",
    label: "Evidence retrieval",
    text: "Gather and rerank supporting passages from both versions.",
  },
  {
    key: "change_detection",
    label: "Change detection",
    text: "Classify added, removed, and modified requirements.",
  },
  {
    key: "conflict_detection",
    label: "Conflict detection",
    text: "Check incompatible requirements across authorized policies.",
  },
  {
    key: "impact_analysis",
    label: "Impact analysis",
    text: "Map affected departments, people, systems, and operations.",
  },
  {
    key: "risk_assessment",
    label: "Risk assessment",
    text: "Calibrate likelihood, impact, urgency, and confidence.",
  },
  {
    key: "action_plan",
    label: "Action plan",
    text: "Create department-specific, accountable implementation work.",
  },
  {
    key: "quality_review",
    label: "Quality review",
    text: "Check evidence, citations, completeness, and unsupported claims.",
  },
  {
    key: "human_approval",
    label: "Human approval",
    text: "Pause high-risk findings for an authorized reviewer.",
  },
  {
    key: "final_report",
    label: "Final report",
    text: "Publish the approved, evidence-backed analysis.",
  },
];

function normalizeNode(value: string) {
  return value.toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
}

export function ComparisonProgress({ comparisonId }: { comparisonId: string }) {
  const router = useRouter();
  const endpoint = `/api/v1/comparisons/${encodeURIComponent(comparisonId)}/progress`;
  const { data, loading, error, refresh } = useApi(endpoint, { pollMs: 4000 });
  const root = recordValue(data);
  const run = isRecord(root.run) ? root.run : root;
  const activeJob = isRecord(root.active_job) ? root.active_job : null;
  const state = isRecord(run.state) ? run.state : run;
  const status = firstString(
    run,
    ["status", "workflow_status"],
    firstString(state, ["status"], "running"),
  ).toLowerCase();
  const jobStatus = activeJob
    ? firstString(activeJob, ["status"], "").toLowerCase()
    : "";
  const retryScheduled = ["queued", "running", "retry_scheduled"].includes(
    jobStatus,
  );
  const displayStatus =
    retryScheduled && ["failed", "error"].includes(status) ? jobStatus : status;
  const currentNode = normalizeNode(
    firstString(
      run,
      ["currentNode", "current_node"],
      firstString(
        state,
        ["currentNode", "current_node"],
        "document_validation",
      ),
    ),
  );
  const currentIndex = Math.max(
    0,
    nodes.findIndex((node) => currentNode.includes(node.key)),
  );
  const complete = ["complete", "completed", "approved", "finalized"].includes(
    status,
  );
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  useEffect(() => {
    if (complete) {
      const timer = setTimeout(
        () => router.replace(`/comparisons/${comparisonId}/results`),
        900,
      );
      return () => clearTimeout(timer);
    }
  }, [complete, comparisonId, router]);
  if (loading && !data)
    return (
      <SectionCard>
        <LoadingState label="Restoring workflow checkpoint…" rows={7} />
      </SectionCard>
    );
  if (error && !data)
    return (
      <SectionCard>
        <ErrorState message={error} onRetry={refresh} />
      </SectionCard>
    );
  const waiting =
    displayStatus.includes("approval") ||
    currentNode.includes("human_approval");
  const failed = ["failed", "error"].includes(status) && !retryScheduled;
  const runId = firstString(run, ["id"], "");
  async function retryWorkflow() {
    if (!runId || retrying) return;
    setRetrying(true);
    setRetryError("");
    try {
      const response = await fetch(
        `/api/v1/workflows/${encodeURIComponent(runId)}`,
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          isRecord(payload) && isRecord(payload.error)
            ? firstString(
                payload.error,
                ["message"],
                "Unable to queue the retry.",
              )
            : "Unable to queue the retry.";
        throw new Error(message);
      }
      await refresh();
    } catch (retryFailure) {
      setRetryError(
        retryFailure instanceof Error
          ? retryFailure.message
          : "Unable to queue the retry.",
      );
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <SectionCard
        title="Agent workflow"
        description="Progress is checkpointed in the database and can resume after interruption."
      >
        <ol className="divide-y divide-[#edf0ee] px-5 sm:px-6">
          {nodes.map((node, index) => {
            const done = complete || index < currentIndex;
            const active = !complete && index === currentIndex;
            return (
              <li key={node.key} className="flex gap-4 py-4">
                <span
                  className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${done ? "bg-emerald-600 text-white" : active ? "bg-sky-600 text-white" : "bg-[#eef1ef] text-[#8a948f]"}`}
                >
                  {done ? (
                    <Check className="size-4" />
                  ) : active ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <span className="text-[10px] font-bold">{index + 1}</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={`text-sm font-semibold ${active ? "text-sky-800" : "text-[#33413b]"}`}
                    >
                      {node.label}
                    </p>
                    {active && (
                      <Badge tone={waiting ? "warning" : "info"}>
                        {waiting ? "Waiting" : "In progress"}
                      </Badge>
                    )}
                    {done && <Badge tone="success">Complete</Badge>}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#79847f]">
                    {node.text}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </SectionCard>
      <aside className="space-y-5">
        <SectionCard title="Workflow status">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <Badge tone={statusTone(displayStatus)}>
                {displayStatus.replaceAll("_", " ")}
              </Badge>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#84908a]">
                <CircleDot className="size-3" /> Live
              </span>
            </div>
            <dl className="mt-5 space-y-3 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-[#7a8580]">Current stage</dt>
                <dd className="text-right font-semibold capitalize text-[#34423c]">
                  {currentNode.replaceAll("_", " ")}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#7a8580]">Revision count</dt>
                <dd className="font-semibold">
                  {numberValue(state.revision_count ?? state.revisionCount)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#7a8580]">Checkpoint</dt>
                <dd className="font-semibold">Persisted</dd>
              </div>
            </dl>
          </div>
        </SectionCard>
        {retryScheduled && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
            <LoaderCircle className="size-5 animate-spin text-sky-700" />
            <h3 className="mt-3 text-sm font-semibold text-sky-900">
              Recovery queued
            </h3>
            <p className="mt-2 text-xs leading-5 text-sky-800">
              The worker will resume policy extraction from the saved
              checkpoint. Keep the local worker running.
            </p>
          </div>
        )}
        {waiting && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <ShieldCheck className="size-5 text-amber-700" />
            <h3 className="mt-3 text-sm font-semibold text-amber-900">
              Human judgment required
            </h3>
            <p className="mt-2 text-xs leading-5 text-amber-800">
              A high or critical risk paused the workflow. An authorized
              reviewer must inspect evidence and decide what happens next.
            </p>
            <div className="mt-4">
              <ButtonLink href="/approvals" variant="secondary">
                Open approval queue
              </ButtonLink>
            </div>
          </div>
        )}
        {failed && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <TriangleAlert className="size-5 text-rose-700" />
            <h3 className="mt-3 text-sm font-semibold text-rose-900">
              Workflow stopped safely
            </h3>
            <p className="mt-2 text-xs leading-5 text-rose-800">
              The last successful checkpoint is preserved. Retry this workflow
              without creating another comparison.
            </p>
            <button
              type="button"
              onClick={retryWorkflow}
              disabled={retrying || !runId}
              className={`${secondaryButtonClass} mt-4 border-rose-200 text-rose-800`}
            >
              {retrying ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Queuing retry
                </>
              ) : (
                "Retry analysis"
              )}
            </button>
            {retryError && (
              <p className="mt-2 text-xs text-rose-700" role="alert">
                {retryError}
              </p>
            )}
          </div>
        )}
        {complete && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <GitBranch className="size-5 text-emerald-700" />
            <h3 className="mt-3 text-sm font-semibold text-emerald-900">
              Analysis complete
            </h3>
            <p className="mt-2 text-xs leading-5 text-emerald-800">
              Opening the cited comparison results now.
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 px-2 text-[10px] leading-4 text-[#8a948f]">
          <Clock3 className="size-3.5 shrink-0" />
          This page checks for persisted progress every few seconds.
        </div>
      </aside>
    </div>
  );
}
