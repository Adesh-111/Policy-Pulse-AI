import type { RunnableConfig } from "@langchain/core/runnables";
import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
} from "@langchain/langgraph";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PolicyWorkflowState, WorkflowNodeName } from "./state";

type PutArguments = Parameters<BaseCheckpointSaver["put"]>;
type PutWritesArguments = Parameters<BaseCheckpointSaver["putWrites"]>;
type ListOptions = Parameters<BaseCheckpointSaver["list"]>[1];

interface CheckpointIdentifiers {
  threadId: string;
  organizationId: string;
  namespace: string;
  checkpointId?: string;
}

interface WorkflowRunRow {
  id: string;
  organization_id: string;
  thread_id: string;
}

interface CheckpointRow {
  checkpoint_id: string;
  checkpoint_namespace: string;
  parent_checkpoint_id: string | null;
  state: unknown;
  channel_values: Record<string, unknown> | null;
  channel_versions: Record<string, string | number> | null;
  versions_seen: Record<string, Record<string, string | number>> | null;
  pending_sends: unknown;
  metadata: unknown;
  created_at: string;
}

function stringConfig(config: RunnableConfig, key: string): string | undefined {
  const value = config.configurable?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function checkpointIdentifiers(
  config: RunnableConfig,
  checkpointRequired = false,
): CheckpointIdentifiers {
  const threadId = stringConfig(config, "thread_id");
  const organizationId = stringConfig(config, "organization_id");
  const checkpointId = stringConfig(config, "checkpoint_id");
  const namespace = stringConfig(config, "checkpoint_ns") ?? "";
  if (!threadId)
    throw new Error("LangGraph config requires configurable.thread_id");
  if (!organizationId)
    throw new Error("LangGraph config requires configurable.organization_id");
  if (checkpointRequired && !checkpointId) {
    throw new Error(
      "LangGraph config requires configurable.checkpoint_id for pending writes",
    );
  }
  return { threadId, organizationId, namespace, checkpointId };
}

function jsonCompatible<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (error) {
    throw new Error(
      "Workflow state contains a value that cannot be checkpointed as JSON",
      { cause: error },
    );
  }
}

function nodeName(metadata: CheckpointMetadata): string {
  const writes = (metadata as Record<string, unknown>).writes;
  if (writes && typeof writes === "object")
    return Object.keys(writes)[0] ?? "checkpoint";
  return metadata.source;
}

function pendingWrites(value: unknown): Array<[string, string, unknown]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!Array.isArray(item) || item.length !== 3) return [];
    const [taskId, channel, writeValue] = item;
    return typeof taskId === "string" && typeof channel === "string"
      ? [[taskId, channel, writeValue] as [string, string, unknown]]
      : [];
  });
}

export interface WorkflowRunStore {
  persistNodeState(
    state: PolicyWorkflowState,
    node: WorkflowNodeName,
  ): Promise<void>;
  markFailed(
    state: PolicyWorkflowState,
    node: WorkflowNodeName,
    error: string,
  ): Promise<void>;
}

export class SupabaseWorkflowRunStore implements WorkflowRunStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async persistNodeState(
    state: PolicyWorkflowState,
    node: WorkflowNodeName,
  ): Promise<void> {
    const databaseStatus = state.status === "invalid" ? "failed" : state.status;
    const { error } = await this.supabase
      .from("workflow_runs")
      .update({
        current_node: node,
        status: databaseStatus,
        state: jsonCompatible(state),
        retry_count: state.totalRevisionCount,
        updated_at: state.updatedAt,
        completed_at: state.completedAt,
      })
      .eq("id", state.runId)
      .eq("organization_id", state.organizationId);
    if (error)
      throw new Error(`Unable to persist workflow run state: ${error.message}`);
  }

  async markFailed(
    state: PolicyWorkflowState,
    node: WorkflowNodeName,
    errorMessage: string,
  ): Promise<void> {
    const failedState: PolicyWorkflowState = {
      ...state,
      currentNode: node,
      status: "failed",
      errors: [...state.errors, errorMessage],
      updatedAt: new Date().toISOString(),
    };
    const { error } = await this.supabase
      .from("workflow_runs")
      .update({
        current_node: node,
        status: "failed",
        state: jsonCompatible(failedState),
        last_error: {
          message: errorMessage,
          node,
          occurred_at: failedState.updatedAt,
        },
        updated_at: failedState.updatedAt,
      })
      .eq("id", state.runId)
      .eq("organization_id", state.organizationId);
    if (error)
      throw new Error(`Unable to persist workflow failure: ${error.message}`);
  }
}

export class SupabaseLangGraphCheckpointer extends BaseCheckpointSaver {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly scopedOrganizationId?: string,
  ) {
    super();
  }

  private assertOrganization(organizationId: string): void {
    if (
      this.scopedOrganizationId &&
      organizationId !== this.scopedOrganizationId
    ) {
      throw new Error("Cross-organization checkpoint access is forbidden");
    }
  }

  private async resolveRun(
    identifiers: CheckpointIdentifiers,
  ): Promise<WorkflowRunRow> {
    this.assertOrganization(identifiers.organizationId);
    const { data, error } = await this.supabase
      .from("workflow_runs")
      .select("id,organization_id,thread_id")
      .eq("thread_id", identifiers.threadId)
      .eq("organization_id", identifiers.organizationId)
      .single();
    if (error || !data)
      throw new Error(
        `Workflow run was not found for thread ${identifiers.threadId}`,
      );
    return data as unknown as WorkflowRunRow;
  }

  private tupleFromRow(
    run: WorkflowRunRow,
    row: CheckpointRow,
  ): CheckpointTuple {
    const stored =
      row.state && typeof row.state === "object"
        ? (row.state as Partial<Checkpoint>)
        : {};
    const checkpoint: Checkpoint = {
      v: stored.v ?? 4,
      id: row.checkpoint_id,
      ts: stored.ts ?? row.created_at,
      channel_values: row.channel_values ?? stored.channel_values ?? {},
      channel_versions: row.channel_versions ?? stored.channel_versions ?? {},
      versions_seen: row.versions_seen ?? stored.versions_seen ?? {},
    };
    const configurable = {
      thread_id: run.thread_id,
      organization_id: run.organization_id,
      checkpoint_ns: row.checkpoint_namespace,
      checkpoint_id: row.checkpoint_id,
    };
    const tuple: CheckpointTuple = {
      config: { configurable },
      checkpoint,
      metadata: (row.metadata ?? undefined) as CheckpointMetadata | undefined,
      pendingWrites: pendingWrites(row.pending_sends),
    };
    if (row.parent_checkpoint_id) {
      tuple.parentConfig = {
        configurable: {
          ...configurable,
          checkpoint_id: row.parent_checkpoint_id,
        },
      };
    }
    return tuple;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const identifiers = checkpointIdentifiers(config);
    const run = await this.resolveRun(identifiers);
    let query = this.supabase
      .from("workflow_checkpoints")
      .select(
        "checkpoint_id,checkpoint_namespace,parent_checkpoint_id,state,channel_values,channel_versions,versions_seen,pending_sends,metadata,created_at",
      )
      .eq("workflow_run_id", run.id)
      .eq("checkpoint_namespace", identifiers.namespace);
    if (identifiers.checkpointId)
      query = query.eq("checkpoint_id", identifiers.checkpointId);
    const { data, error } = await query
      .order("sequence_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw new Error(`Unable to load workflow checkpoint: ${error.message}`);
    return data
      ? this.tupleFromRow(run, data as unknown as CheckpointRow)
      : undefined;
  }

  async *list(
    config: RunnableConfig,
    options?: ListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const identifiers = checkpointIdentifiers(config);
    const run = await this.resolveRun(identifiers);
    let query = this.supabase
      .from("workflow_checkpoints")
      .select(
        "checkpoint_id,checkpoint_namespace,parent_checkpoint_id,state,channel_values,channel_versions,versions_seen,pending_sends,metadata,created_at,sequence_number",
      )
      .eq("workflow_run_id", run.id)
      .order("sequence_number", { ascending: false });
    if (identifiers.namespace)
      query = query.eq("checkpoint_namespace", identifiers.namespace);
    if (identifiers.checkpointId)
      query = query.eq("checkpoint_id", identifiers.checkpointId);
    const beforeId = stringConfig(options?.before ?? {}, "checkpoint_id");
    if (beforeId) query = query.lt("checkpoint_id", beforeId);
    if (options?.limit !== undefined)
      query = query.limit(Math.max(0, options.limit));
    const { data, error } = await query;
    if (error)
      throw new Error(`Unable to list workflow checkpoints: ${error.message}`);
    for (const rawRow of (data ?? []) as unknown[]) {
      const row = rawRow as CheckpointRow;
      const metadata =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {};
      if (
        options?.filter &&
        !Object.entries(options.filter).every(
          ([key, value]) => metadata[key] === value,
        )
      ) {
        continue;
      }
      yield this.tupleFromRow(run, row);
    }
  }

  async put(
    config: PutArguments[0],
    checkpoint: PutArguments[1],
    metadata: PutArguments[2],
    _newVersions: PutArguments[3],
  ): Promise<RunnableConfig> {
    void _newVersions;
    const identifiers = checkpointIdentifiers(config);
    const run = await this.resolveRun(identifiers);
    const { error } = await this.supabase.rpc("save_workflow_checkpoint", {
      p_workflow_run_id: run.id,
      p_checkpoint_id: checkpoint.id,
      p_node_name: nodeName(metadata),
      p_state: jsonCompatible(checkpoint),
      p_parent_checkpoint_id: identifiers.checkpointId ?? null,
      p_checkpoint_namespace: identifiers.namespace,
      p_channel_values: jsonCompatible(checkpoint.channel_values),
      p_channel_versions: jsonCompatible(checkpoint.channel_versions),
      p_versions_seen: jsonCompatible(checkpoint.versions_seen),
      p_pending_sends: [],
      p_metadata: jsonCompatible(metadata),
    });
    if (error)
      throw new Error(`Unable to save workflow checkpoint: ${error.message}`);
    return {
      configurable: {
        ...config.configurable,
        thread_id: identifiers.threadId,
        organization_id: identifiers.organizationId,
        checkpoint_ns: identifiers.namespace,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(
    config: PutWritesArguments[0],
    writes: PutWritesArguments[1],
    taskId: PutWritesArguments[2],
  ): Promise<void> {
    const identifiers = checkpointIdentifiers(config, true);
    const run = await this.resolveRun(identifiers);
    const { data, error: readError } = await this.supabase
      .from("workflow_checkpoints")
      .select("pending_sends")
      .eq("workflow_run_id", run.id)
      .eq("checkpoint_namespace", identifiers.namespace)
      .eq("checkpoint_id", identifiers.checkpointId as string)
      .single();
    if (readError)
      throw new Error(
        `Unable to load pending checkpoint writes: ${readError.message}`,
      );
    const existing = pendingWrites(
      (data as unknown as { pending_sends?: unknown })?.pending_sends,
    );
    const additions = writes.map(
      ([channel, value]) =>
        [taskId, channel, jsonCompatible(value)] as [string, string, unknown],
    );
    const merged = new Map<string, [string, string, unknown]>();
    existing.forEach((item, index) =>
      merged.set(`${item[0]}:${item[1]}:${index}`, item),
    );
    additions.forEach((item, index) =>
      merged.set(`${item[0]}:${item[1]}:${index}`, item),
    );
    const { error } = await this.supabase
      .from("workflow_checkpoints")
      .update({ pending_sends: [...merged.values()] })
      .eq("workflow_run_id", run.id)
      .eq("checkpoint_namespace", identifiers.namespace)
      .eq("checkpoint_id", identifiers.checkpointId as string);
    if (error)
      throw new Error(
        `Unable to persist pending checkpoint writes: ${error.message}`,
      );
  }

  async deleteThread(threadId: string): Promise<void> {
    if (!threadId) throw new Error("A thread ID is required");
    if (!this.scopedOrganizationId) {
      throw new Error(
        "deleteThread requires an organization-scoped checkpointer",
      );
    }
    const { data, error: runError } = await this.supabase
      .from("workflow_runs")
      .select("id")
      .eq("thread_id", threadId)
      .eq("organization_id", this.scopedOrganizationId);
    if (runError)
      throw new Error(
        `Unable to locate workflow checkpoints: ${runError.message}`,
      );
    const runIds = ((data ?? []) as unknown[]).map((row) =>
      String((row as Record<string, unknown>).id),
    );
    if (runIds.length === 0) return;
    const { error } = await this.supabase
      .from("workflow_checkpoints")
      .delete()
      .in("workflow_run_id", runIds);
    if (error)
      throw new Error(
        `Unable to delete workflow checkpoints: ${error.message}`,
      );
  }
}
