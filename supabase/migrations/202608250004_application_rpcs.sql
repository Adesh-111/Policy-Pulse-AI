-- Transactional application RPCs for uploads, durable jobs/checkpoints, and RAG.

-- Superseded by record_approval_decision below, which requires optimistic
-- analysis-version validation. Keep the legacy function non-callable by clients.
revoke execute on function public.decide_approval(
  uuid, public.approval_decision_type, text
) from authenticated, service_role;

create or replace function public.create_document_record(
  p_document_id uuid,
  p_organization_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_version text,
  p_designation public.document_designation,
  p_effective_date date,
  p_original_filename text,
  p_mime_type text,
  p_file_extension text,
  p_file_size_bytes bigint,
  p_content_sha256 text,
  p_storage_path text,
  p_primary_department_id uuid default null,
  p_department_ids uuid[] default '{}'::uuid[],
  p_metadata jsonb default '{}'::jsonb
)
returns public.documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.documents%rowtype;
  v_expected_prefix text;
begin
  if p_document_id is null or p_organization_id is null then
    raise exception 'Document and organization ids are required' using errcode = '22023';
  end if;
  if not public.is_service_role() and not public.has_org_role(
    p_organization_id,
    array['administrator'::public.app_role, 'policy_manager'::public.app_role]
  ) then
    raise exception 'Not authorized to upload policies for this organization'
      using errcode = '42501';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Document metadata must be a JSON object' using errcode = '22023';
  end if;

  v_expected_prefix := p_organization_id::text || '/' || p_document_id::text || '/';
  if p_storage_path is null or left(p_storage_path, char_length(v_expected_prefix)) <> v_expected_prefix then
    raise exception 'Storage path must begin with %', v_expected_prefix using errcode = '22023';
  end if;

  if p_primary_department_id is not null and not exists (
    select 1 from public.departments d
    where d.id = p_primary_department_id
      and d.organization_id = p_organization_id
      and d.is_active
  ) then
    raise exception 'Primary department is not active in this organization'
      using errcode = '23503';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_department_ids, '{}'::uuid[])) requested(department_id)
    left join public.departments d
      on d.id = requested.department_id
     and d.organization_id = p_organization_id
     and d.is_active
    where requested.department_id is null or d.id is null
  ) then
    raise exception 'One or more document departments are invalid or inactive'
      using errcode = '23503';
  end if;

  if p_content_sha256 is not null and exists (
    select 1
    from public.documents d
    where d.organization_id = p_organization_id
      and d.content_sha256 = lower(p_content_sha256)
  ) then
    raise unique_violation using
      message = 'A document with this content hash already exists in the organization',
      constraint = 'documents_tenant_checksum_unique';
  end if;

  insert into public.documents (
    id, organization_id, department_id, uploaded_by, title, description,
    category, version, designation, effective_date, original_filename,
    mime_type, file_extension, file_size_bytes, content_sha256,
    storage_bucket, storage_path, processing_status, metadata
  ) values (
    p_document_id, p_organization_id, p_primary_department_id, auth.uid(),
    p_title, coalesce(p_description, ''), p_category, p_version, p_designation,
    p_effective_date, p_original_filename, p_mime_type, lower(p_file_extension),
    p_file_size_bytes, lower(p_content_sha256), 'policy-documents', p_storage_path,
    'uploaded', p_metadata
  )
  returning * into v_document;

  insert into public.document_departments (document_id, department_id, organization_id)
  select p_document_id, department_id, p_organization_id
  from (
    select distinct department_id
    from unnest(
      coalesce(p_department_ids, '{}'::uuid[]) ||
      case
        when p_primary_department_id is null then '{}'::uuid[]
        else array[p_primary_department_id]
      end
    ) department_ids(department_id)
    where department_id is not null
  ) scoped_departments;

  perform public.write_audit_log(
    p_organization_id,
    'document.created',
    'document',
    p_document_id::text,
    null,
    jsonb_build_object(
      'title', v_document.title,
      'version', v_document.version,
      'designation', v_document.designation,
      'processingStatus', v_document.processing_status
    ),
    jsonb_build_object('storagePath', v_document.storage_path)
  );

  return v_document;
end;
$$;

create or replace function public.claim_background_jobs(
  p_worker_id uuid,
  p_limit integer,
  p_lease_seconds integer
)
returns setof public.background_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_worker_id is null then
    raise exception 'Worker id is required' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Claim limit must be between 1 and 50' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 10 and 900 then
    raise exception 'Lease must be between 10 and 900 seconds' using errcode = '22023';
  end if;

  update public.background_jobs
  set status = case
        when attempts >= max_attempts then 'failed'::public.job_status
        else 'retry_scheduled'::public.job_status
      end,
      next_attempt_at = case
        when attempts >= max_attempts then next_attempt_at
        else clock_timestamp()
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = coalesce(
        last_error,
        jsonb_build_object('type', 'lease_expired', 'message', 'Previous worker lease expired')
      )
  where status = 'running'
    and lease_expires_at < clock_timestamp();

  return query
  with candidates as (
    select j.id
    from public.background_jobs j
    where j.status in ('queued', 'retry_scheduled')
      and j.next_attempt_at <= clock_timestamp()
      and j.attempts < j.max_attempts
    order by j.priority desc, j.next_attempt_at, j.created_at
    for update skip locked
    limit p_limit
  )
  update public.background_jobs j
  set status = 'running',
      attempts = j.attempts + 1,
      lease_owner = p_worker_id,
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      started_at = coalesce(j.started_at, clock_timestamp())
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

create or replace function public.heartbeat_background_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_lease_seconds is null or p_lease_seconds not between 10 and 900 then
    raise exception 'Lease must be between 10 and 900 seconds' using errcode = '22023';
  end if;
  update public.background_jobs
  set lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
  where id = p_job_id
    and status = 'running'
    and lease_owner = p_worker_id
    and lease_expires_at >= clock_timestamp();
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.complete_background_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_result jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_result is null or jsonb_typeof(p_result) not in ('object', 'array') then
    raise exception 'Job result must be a JSON object or array' using errcode = '22023';
  end if;
  update public.background_jobs
  set status = 'completed',
      result = p_result,
      completed_at = clock_timestamp(),
      lease_owner = null,
      lease_expires_at = null,
      last_error = null
  where id = p_job_id
    and status = 'running'
    and lease_owner = p_worker_id;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.fail_background_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_error jsonb,
  p_retry_delay_seconds integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_error is null or jsonb_typeof(p_error) <> 'object' then
    raise exception 'Job error must be a JSON object' using errcode = '22023';
  end if;
  if p_retry_delay_seconds is null or p_retry_delay_seconds not between 0 and 86400 then
    raise exception 'Retry delay must be between 0 and 86400 seconds' using errcode = '22023';
  end if;

  update public.background_jobs
  set status = case
        when attempts >= max_attempts then 'failed'::public.job_status
        else 'retry_scheduled'::public.job_status
      end,
      next_attempt_at = clock_timestamp() + make_interval(secs => p_retry_delay_seconds),
      last_error = p_error,
      completed_at = case when attempts >= max_attempts then clock_timestamp() else null end,
      lease_owner = null,
      lease_expires_at = null
  where id = p_job_id
    and status = 'running'
    and lease_owner = p_worker_id;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

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
      state = p_state,
      last_heartbeat_at = clock_timestamp()
  where id = v_run.id;

  return v_checkpoint;
end;
$$;

create or replace function public.record_approval_decision(
  p_request_id uuid,
  p_decision public.approval_decision_type,
  p_notes text,
  p_expected_analysis_version integer
)
returns public.approval_decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approval_requests%rowtype;
  v_comparison public.policy_comparisons%rowtype;
  v_decision public.approval_decisions%rowtype;
  v_new_status public.approval_status;
  v_next_analysis_version integer;
begin
  select * into v_request
  from public.approval_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Approval request not found' using errcode = 'P0002';
  end if;
  if not public.has_org_role(
    v_request.organization_id,
    array['administrator'::public.app_role, 'policy_manager'::public.app_role]
  ) then
    raise exception 'Not authorized to decide this approval request' using errcode = '42501';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Approval request has already been resolved' using errcode = '23514';
  end if;
  if p_expected_analysis_version is null
     or p_expected_analysis_version <> v_request.analysis_version then
    raise exception 'Analysis version changed; refresh the approval request before deciding'
      using errcode = '40001';
  end if;
  if p_notes is null or char_length(p_notes) > 10000 then
    raise exception 'Approval notes must be present and no longer than 10000 characters'
      using errcode = '22001';
  end if;

  select * into v_comparison
  from public.policy_comparisons
  where id = v_request.comparison_id
  for update;

  if v_comparison.analysis_version <> p_expected_analysis_version then
    raise exception 'Comparison analysis version changed; refresh before deciding'
      using errcode = '40001';
  end if;

  v_new_status := p_decision::text::public.approval_status;
  v_next_analysis_version := case
    when p_decision = 'revision_requested' then v_comparison.analysis_version + 1
    else v_comparison.analysis_version
  end;

  insert into public.approval_decisions (
    organization_id, approval_request_id, reviewer_id, decision, notes,
    previous_status, new_status, analysis_version
  ) values (
    v_request.organization_id, v_request.id, auth.uid(), p_decision, p_notes,
    v_request.status, v_new_status, v_request.analysis_version
  ) returning * into v_decision;

  update public.approval_requests
  set status = v_new_status,
      resolved_at = clock_timestamp()
  where id = v_request.id;

  update public.policy_comparisons
  set status = case p_decision
        when 'approved' then 'approved'::public.comparison_status
        when 'rejected' then 'rejected'::public.comparison_status
        else 'revision_requested'::public.comparison_status
      end,
      analysis_version = v_next_analysis_version
  where id = v_comparison.id;

  if v_request.workflow_run_id is not null then
    update public.workflow_runs
    set status = 'pending',
        current_node = case
          when p_decision = 'approved' then 'final_report'
          else 'revision'
        end,
        state = state || jsonb_build_object(
          'approvalResume', jsonb_build_object(
            'requestId', v_request.id,
            'decisionId', v_decision.id,
            'decision', p_decision,
            'notes', p_notes,
            'reviewerId', auth.uid(),
            'decidedAt', clock_timestamp(),
            'analysisVersion', v_request.analysis_version,
            'nextAnalysisVersion', v_next_analysis_version
          )
        ),
        next_retry_at = clock_timestamp(),
        paused_at = null,
        lease_owner = null,
        lease_expires_at = null,
        last_error = null
    where id = v_request.workflow_run_id;
  end if;

  perform public.write_audit_log(
    v_request.organization_id,
    'approval.decided',
    'approval_request',
    v_request.id::text,
    jsonb_build_object(
      'status', v_request.status,
      'analysisVersion', v_request.analysis_version
    ),
    jsonb_build_object(
      'status', v_new_status,
      'decision', p_decision,
      'nextAnalysisVersion', v_next_analysis_version
    ),
    jsonb_build_object(
      'decisionId', v_decision.id,
      'comparisonId', v_comparison.id,
      'workflowRunId', v_request.workflow_run_id
    )
  );

  return v_decision;
end;
$$;

create or replace function public.hybrid_search_document_chunks(
  query_text text,
  query_embedding extensions.vector(1536),
  match_count integer default 12,
  semantic_weight real default 0.65,
  full_text_weight real default 0.35,
  rrf_k integer default 60,
  filter_organization_id uuid default null,
  filter_document_ids uuid[] default null,
  filter_department_ids uuid[] default null,
  filter_versions text[] default null,
  min_similarity real default 0
)
returns table (
  chunk_id uuid,
  document_id uuid,
  organization_id uuid,
  department_id uuid,
  document_title text,
  document_version text,
  category text,
  effective_date date,
  page_number integer,
  section_heading text,
  chunk_index integer,
  content text,
  storage_path text,
  metadata jsonb,
  semantic_score double precision,
  full_text_score real,
  combined_score double precision
)
language sql
stable
security invoker
set search_path = pg_catalog, public, extensions
as $$
  with scoped_chunks as materialized (
    select c.*, d.title as document_title
    from public.document_chunks c
    join public.documents d on d.id = c.document_id
    where d.processing_status = 'indexed'
      and (
        (
          public.is_service_role()
          and filter_organization_id is not null
          and c.organization_id = filter_organization_id
        )
        or (
          not public.is_service_role()
          and public.can_access_document(d.id)
        )
      )
      and (filter_organization_id is null or c.organization_id = filter_organization_id)
      and (filter_document_ids is null or c.document_id = any(filter_document_ids))
      and (filter_versions is null or c.document_version = any(filter_versions))
      and (
        filter_department_ids is null
        or c.department_id = any(filter_department_ids)
        or exists (
          select 1
          from public.document_departments dd
          where dd.document_id = c.document_id
            and dd.department_id = any(filter_department_ids)
        )
      )
  ),
  semantic_candidates as (
    select
      c.id,
      1 - (c.embedding operator(extensions.<=>) query_embedding) as score,
      row_number() over (
        order by c.embedding operator(extensions.<=>) query_embedding, c.id
      ) as result_rank
    from scoped_chunks c
    where query_embedding is not null
      and c.embedding is not null
      and 1 - (c.embedding operator(extensions.<=>) query_embedding) >= min_similarity
    order by c.embedding operator(extensions.<=>) query_embedding, c.id
    limit least(greatest(match_count, 1), 50) * 4
  ),
  lexical_candidates as (
    select
      c.id,
      ts_rank_cd(c.search_vector, websearch_to_tsquery('english', query_text), 32) as score,
      row_number() over (
        order by ts_rank_cd(c.search_vector, websearch_to_tsquery('english', query_text), 32) desc, c.id
      ) as result_rank
    from scoped_chunks c
    where nullif(btrim(query_text), '') is not null
      and c.search_vector @@ websearch_to_tsquery('english', query_text)
    order by score desc, c.id
    limit least(greatest(match_count, 1), 50) * 4
  ),
  fused as (
    select
      coalesce(s.id, l.id) as id,
      s.score as semantic_score,
      l.score as full_text_score,
      (
        greatest(semantic_weight, 0)::double precision *
          coalesce(1.0 / (greatest(rrf_k, 1) + s.result_rank), 0.0)
        + greatest(full_text_weight, 0)::double precision *
          coalesce(1.0 / (greatest(rrf_k, 1) + l.result_rank), 0.0)
      ) / nullif(greatest(semantic_weight, 0) + greatest(full_text_weight, 0), 0) as combined_score
    from semantic_candidates s
    full join lexical_candidates l on l.id = s.id
  )
  select
    c.id as chunk_id,
    c.document_id,
    c.organization_id,
    c.department_id,
    c.document_title,
    c.document_version,
    c.category,
    c.effective_date,
    c.page_number,
    c.section_heading,
    c.chunk_index,
    c.content,
    c.storage_path,
    c.metadata,
    fused.semantic_score,
    fused.full_text_score,
    fused.combined_score
  from fused
  join scoped_chunks c on c.id = fused.id
  where match_count between 1 and 50
    and semantic_weight >= 0
    and full_text_weight >= 0
    and semantic_weight + full_text_weight > 0
    and rrf_k between 1 and 1000
    and min_similarity between -1 and 1
  order by fused.combined_score desc, c.id
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.create_document_record(
  uuid, uuid, text, text, text, text, public.document_designation, date,
  text, text, text, bigint, text, text, uuid, uuid[], jsonb
) from public;
revoke all on function public.claim_background_jobs(uuid, integer, integer) from public;
revoke all on function public.heartbeat_background_job(uuid, uuid, integer) from public;
revoke all on function public.complete_background_job(uuid, uuid, jsonb) from public;
revoke all on function public.fail_background_job(uuid, uuid, jsonb, integer) from public;
revoke all on function public.save_workflow_checkpoint(
  uuid, text, text, jsonb, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public;
revoke all on function public.record_approval_decision(
  uuid, public.approval_decision_type, text, integer
) from public;
revoke all on function public.hybrid_search_document_chunks(
  text, extensions.vector, integer, real, real, integer, uuid, uuid[], uuid[], text[], real
) from public;

grant execute on function public.create_document_record(
  uuid, uuid, text, text, text, text, public.document_designation, date,
  text, text, text, bigint, text, text, uuid, uuid[], jsonb
) to authenticated, service_role;
grant execute on function public.claim_background_jobs(uuid, integer, integer) to service_role;
grant execute on function public.heartbeat_background_job(uuid, uuid, integer) to service_role;
grant execute on function public.complete_background_job(uuid, uuid, jsonb) to service_role;
grant execute on function public.fail_background_job(uuid, uuid, jsonb, integer) to service_role;
grant execute on function public.save_workflow_checkpoint(
  uuid, text, text, jsonb, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated, service_role;
grant execute on function public.record_approval_decision(
  uuid, public.approval_decision_type, text, integer
) to authenticated, service_role;
grant execute on function public.hybrid_search_document_chunks(
  text, extensions.vector, integer, real, real, integer, uuid, uuid[], uuid[], text[], real
) to authenticated, service_role;
