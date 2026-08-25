-- Keep the LangGraph checkpoint row and workflow pointer in one transaction.
-- The checkpoint envelope is deliberately not copied into workflow_runs.state:
-- that column stores the validated PolicyWorkflowState projection used to resume
-- bounded Vercel executions, while the full LangGraph envelope lives here.
create or replace function public.save_workflow_checkpoint(
  p_workflow_run_id uuid,
  p_checkpoint_id text,
  p_node_name text,
  p_state jsonb,
  p_parent_checkpoint_id text default null,
  p_checkpoint_namespace text default '',
  p_channel_values jsonb default '{}'::jsonb,
  p_channel_versions jsonb default '{}'::jsonb,
  p_versions_seen jsonb default '{}'::jsonb,
  p_pending_sends jsonb default '[]'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns public.workflow_checkpoints
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.workflow_runs%rowtype;
  v_checkpoint public.workflow_checkpoints%rowtype;
begin
  select * into v_run
  from public.workflow_runs
  where id = p_workflow_run_id
  for update;

  if not found then
    raise exception 'Workflow run not found' using errcode = 'P0002';
  end if;
  if not public.is_service_role() and not public.has_org_role(
    v_run.organization_id,
    array['administrator'::public.app_role, 'policy_manager'::public.app_role]
  ) then
    raise exception 'Not authorized to checkpoint this workflow' using errcode = '42501';
  end if;
  if jsonb_typeof(p_state) <> 'object'
     or jsonb_typeof(p_channel_values) <> 'object'
     or jsonb_typeof(p_channel_versions) <> 'object'
     or jsonb_typeof(p_versions_seen) <> 'object'
     or jsonb_typeof(p_pending_sends) <> 'array'
     or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Invalid checkpoint JSON structure' using errcode = '22023';
  end if;

  insert into public.workflow_checkpoints (
    organization_id, workflow_run_id, checkpoint_namespace, checkpoint_id,
    parent_checkpoint_id, node_name, state, channel_values, channel_versions,
    versions_seen, pending_sends, metadata, created_by
  ) values (
    v_run.organization_id, v_run.id, coalesce(p_checkpoint_namespace, ''),
    p_checkpoint_id, p_parent_checkpoint_id, p_node_name, p_state,
    p_channel_values, p_channel_versions, p_versions_seen, p_pending_sends,
    p_metadata, auth.uid()
  )
  on conflict (workflow_run_id, checkpoint_namespace, checkpoint_id) do update
    set parent_checkpoint_id = excluded.parent_checkpoint_id,
        node_name = excluded.node_name,
        state = excluded.state,
        channel_values = excluded.channel_values,
        channel_versions = excluded.channel_versions,
        versions_seen = excluded.versions_seen,
        pending_sends = excluded.pending_sends,
        metadata = excluded.metadata
  returning * into v_checkpoint;

  update public.workflow_runs
  set current_checkpoint_id = v_checkpoint.id,
      current_node = p_node_name,
      last_heartbeat_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = v_run.id;

  return v_checkpoint;
end;
$$;

comment on function public.save_workflow_checkpoint(
  uuid, text, text, jsonb, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) is 'Atomically upserts a LangGraph checkpoint and links it to its workflow run without overwriting domain workflow state.';
