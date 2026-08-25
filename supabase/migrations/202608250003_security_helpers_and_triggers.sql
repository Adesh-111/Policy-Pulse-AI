-- Security-definer authorization helpers are deliberately small, STABLE, and
-- schema-qualified. Membership rows, not JWT user metadata, are authoritative.

create or replace function public.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select auth.uid();
$$;

create or replace function public.is_service_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role() = 'service_role', false);
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id and p.is_active
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(
  p_organization_id uuid,
  p_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.profiles p on p.id = m.user_id and p.is_active
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

create or replace function public.current_memberships()
returns table (
  organization_id uuid,
  role public.app_role,
  department_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id, m.role, m.department_id
  from public.memberships m
  join public.profiles p on p.id = m.user_id and p.is_active
  where m.user_id = auth.uid()
    and m.status = 'active'
  order by m.created_at;
$$;

create or replace function public.can_view_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = auth.uid() or exists (
    select 1
    from public.memberships viewer
    join public.memberships subject
      on subject.organization_id = viewer.organization_id
     and subject.status = 'active'
    where viewer.user_id = auth.uid()
      and viewer.status = 'active'
      and subject.user_id = p_user_id
  );
$$;

create or replace function public.can_manage_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships viewer
    join public.memberships subject
      on subject.organization_id = viewer.organization_id
    where viewer.user_id = auth.uid()
      and viewer.status = 'active'
      and viewer.role = 'administrator'
      and subject.user_id = p_user_id
  );
$$;

create or replace function public.can_access_department(
  p_organization_id uuid,
  p_department_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_org_role(
      p_organization_id,
      array[
        'administrator'::public.app_role,
        'policy_manager'::public.app_role,
        'auditor'::public.app_role
      ]
    )
    or (
      public.has_org_role(
        p_organization_id,
        array['department_user'::public.app_role]
      )
      and (
        p_department_id is null
        or exists (
          select 1
          from public.memberships m
          where m.organization_id = p_organization_id
            and m.user_id = auth.uid()
            and m.status = 'active'
            and m.department_id = p_department_id
        )
        or exists (
          select 1
          from public.profile_departments pd
          where pd.organization_id = p_organization_id
            and pd.user_id = auth.uid()
            and pd.department_id = p_department_id
        )
      )
    );
$$;

create or replace function public.can_access_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and (
        public.can_access_department(d.organization_id, d.department_id)
        or exists (
          select 1
          from public.document_departments dd
          where dd.document_id = d.id
            and public.can_access_department(dd.organization_id, dd.department_id)
        )
      )
  );
$$;

create or replace function public.can_view_comparison(p_comparison_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.policy_comparisons pc
    join public.documents old_doc on old_doc.id = pc.old_document_id
    join public.documents new_doc on new_doc.id = pc.new_document_id
    where pc.id = p_comparison_id
      and (
        public.has_org_role(
          pc.organization_id,
          array[
            'administrator'::public.app_role,
            'policy_manager'::public.app_role,
            'auditor'::public.app_role
          ]
        )
        or public.can_access_document(old_doc.id)
        or public.can_access_document(new_doc.id)
        or exists (
          select 1
          from public.action_plans ap
          where ap.comparison_id = pc.id
            and public.can_access_department(ap.organization_id, ap.department_id)
        )
      )
  );
$$;

create or replace function public.owns_chat_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_sessions cs
    where cs.id = p_session_id
      and cs.user_id = auth.uid()
      and public.is_org_member(cs.organization_id)
  );
$$;

create or replace function public.storage_object_organization(p_object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_segment text;
begin
  v_segment := split_part(p_object_name, '/', 1);
  if v_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return v_segment::uuid;
  end if;
  return null;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.protect_organization_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.organization_id is distinct from new.organization_id then
    raise exception 'organization_id is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'departments', 'memberships', 'profile_departments', 'documents',
    'document_departments', 'document_chunks',
    'policy_comparisons', 'policy_changes', 'policy_conflicts', 'risk_assessments',
    'action_plans', 'action_items', 'workflow_runs', 'workflow_checkpoints',
    'background_jobs', 'approval_requests', 'chat_sessions', 'evaluation_questions',
    'evaluation_results', 'reports', 'settings'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.protect_organization_id()',
      v_table || '_protect_organization_id',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.protect_document_provenance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.uploaded_by is distinct from new.uploaded_by
     or old.storage_bucket is distinct from new.storage_bucket
     or old.storage_path is distinct from new.storage_path
     or old.content_sha256 is distinct from new.content_sha256
     or old.file_size_bytes is distinct from new.file_size_bytes then
    raise exception 'Document provenance fields are immutable; create a new version instead'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger documents_protect_provenance
  before update on public.documents
  for each row execute function public.protect_document_provenance();

create or replace function public.protect_membership_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.user_id is distinct from new.user_id then
    raise exception 'Membership user_id is immutable; revoke and create a new membership'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger memberships_protect_identity
  before update on public.memberships
  for each row execute function public.protect_membership_identity();

create or replace function public.protect_last_administrator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removing_admin boolean;
begin
  if tg_op = 'DELETE' then
    v_removing_admin := old.role = 'administrator' and old.status = 'active';
  else
    v_removing_admin := old.role = 'administrator'
      and old.status = 'active'
      and (new.role <> 'administrator' or new.status <> 'active');
  end if;

  if v_removing_admin and not exists (
    select 1
    from public.memberships m
    where m.organization_id = old.organization_id
      and m.id <> old.id
      and m.role = 'administrator'
      and m.status = 'active'
  ) then
    raise exception 'An organization must retain at least one active administrator'
      using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger memberships_protect_last_administrator
  before update of role, status or delete on public.memberships
  for each row execute function public.protect_last_administrator();

create or replace function public.protect_comparison_documents()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.old_document_id is distinct from new.old_document_id
      or old.new_document_id is distinct from new.new_document_id)
     and old.status <> 'draft' then
    raise exception 'Compared documents are immutable after a comparison leaves draft status'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger policy_comparisons_protect_documents
  before update on public.policy_comparisons
  for each row execute function public.protect_comparison_documents();

create or replace function public.protect_workflow_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.thread_id is distinct from new.thread_id
     or old.comparison_id is distinct from new.comparison_id
     or old.created_by is distinct from new.created_by then
    raise exception 'Workflow identity fields are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger workflow_runs_protect_identity
  before update on public.workflow_runs
  for each row execute function public.protect_workflow_identity();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'organizations', 'departments', 'profiles', 'memberships', 'documents',
    'document_chunks', 'policy_comparisons', 'policy_changes', 'policy_conflicts',
    'risk_assessments', 'action_plans', 'action_items', 'workflow_runs',
    'background_jobs', 'approval_requests', 'chat_sessions',
    'evaluation_questions', 'reports', 'settings'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      v_table || '_set_updated_at',
      v_table
    );
  end loop;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_name text;
  v_slug_base text;
  v_organization_id uuid;
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 160)
  )
  on conflict (id) do nothing;

  -- Self-registration may create a new isolated organization, but metadata can
  -- never be used to join an existing tenant or choose a role. Invitations omit
  -- organization_name and are attached later by an existing administrator.
  v_organization_name := nullif(btrim(new.raw_user_meta_data ->> 'organization_name'), '');
  if v_organization_name is not null then
    v_organization_name := left(v_organization_name, 120);
    if char_length(v_organization_name) < 2 then
      v_organization_name := v_organization_name || ' Organization';
    end if;
    v_slug_base := trim(both '-' from lower(regexp_replace(
      v_organization_name,
      '[^a-zA-Z0-9]+',
      '-',
      'g'
    )));
    if v_slug_base = '' then
      v_slug_base := 'organization';
    end if;
    v_organization_id := gen_random_uuid();

    insert into public.organizations (id, name, slug)
    values (
      v_organization_id,
      v_organization_name,
      left(v_slug_base, 80) || '-' || left(replace(new.id::text, '-', ''), 8)
    );

    insert into public.memberships (
      organization_id, user_id, role, status, joined_at
    ) values (
      v_organization_id, new.id, 'administrator', 'active', clock_timestamp()
    );

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, new_values
    ) values (
      v_organization_id,
      new.id,
      'organization.created',
      'organization',
      v_organization_id::text,
      jsonb_build_object('name', v_organization_name)
    );
  end if;
  return new;
end;
$$;

create trigger auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid := coalesce(old.default_organization_id, new.default_organization_id);
begin
  if public.is_service_role() or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if old.default_organization_id is distinct from new.default_organization_id
     or old.department_id is distinct from new.department_id
     or old.is_active is distinct from new.is_active then
    if v_org is null
       or not public.has_org_role(v_org, array['administrator'::public.app_role]) then
      raise exception 'Only an organization administrator may change profile access fields'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_security_fields
  before update on public.profiles
  for each row execute function public.protect_profile_security_fields();

create or replace function public.sync_profile_from_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' then
    update public.profiles p
    set default_organization_id = case
          when p.default_organization_id is null then new.organization_id
          else p.default_organization_id
        end,
        department_id = case
          when p.default_organization_id is null or p.default_organization_id = new.organization_id
            then new.department_id
          else p.department_id
        end
    where p.id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger memberships_sync_default_profile
  after insert or update of status, department_id on public.memberships
  for each row execute function public.sync_profile_from_membership();

create or replace function public.validate_document_processing_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.processing_status <> new.processing_status and not (
    (old.processing_status = 'uploaded' and new.processing_status in ('extracting', 'failed')) or
    (old.processing_status = 'extracting' and new.processing_status in ('chunking', 'failed')) or
    (old.processing_status = 'chunking' and new.processing_status in ('embedding', 'failed')) or
    (old.processing_status = 'embedding' and new.processing_status in ('indexed', 'failed')) or
    (old.processing_status = 'indexed' and new.processing_status in ('embedding', 'failed')) or
    (old.processing_status = 'failed' and new.processing_status in ('uploaded', 'extracting'))
  ) then
    raise exception 'Invalid document processing transition: % -> %',
      old.processing_status, new.processing_status using errcode = '23514';
  end if;

  if new.processing_status <> 'failed' then
    new.processing_error := null;
  end if;
  if new.processing_status = 'indexed' and new.indexed_at is null then
    new.indexed_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger documents_validate_processing_transition
  before update of processing_status on public.documents
  for each row execute function public.validate_document_processing_transition();

create or replace function public.prepare_document_chunk()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_document public.documents%rowtype;
begin
  select * into v_document
  from public.documents
  where id = new.document_id;

  if not found then
    raise exception 'Document % does not exist', new.document_id using errcode = '23503';
  end if;

  new.organization_id := v_document.organization_id;
  new.department_id := v_document.department_id;
  new.document_version := v_document.version;
  new.category := v_document.category;
  new.effective_date := v_document.effective_date;
  new.storage_path := v_document.storage_path;
  return new;
end;
$$;

create trigger document_chunks_copy_document_metadata
  before insert or update on public.document_chunks
  for each row execute function public.prepare_document_chunk();

create or replace function public.sync_document_chunk_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.document_chunks
  set department_id = new.department_id,
      document_version = new.version,
      category = new.category,
      effective_date = new.effective_date,
      storage_path = new.storage_path
  where document_id = new.id;
  return new;
end;
$$;

create trigger documents_sync_chunk_metadata
  after update of department_id, version, category, effective_date, storage_path on public.documents
  for each row execute function public.sync_document_chunk_metadata();

create or replace function public.normalize_action_item_progress()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and not public.is_service_role()
     and public.has_org_role(new.organization_id, array['department_user'::public.app_role])
     and not public.has_org_role(
       new.organization_id,
       array['administrator'::public.app_role, 'policy_manager'::public.app_role]
     ) then
    if old.organization_id is distinct from new.organization_id
       or old.action_plan_id is distinct from new.action_plan_id
       or old.assignee_user_id is distinct from new.assignee_user_id
       or old.title is distinct from new.title
       or old.description is distinct from new.description
       or old.sequence_number is distinct from new.sequence_number
       or old.due_date is distinct from new.due_date
       or old.created_at is distinct from new.created_at then
      raise exception 'Department users may update action progress fields only'
        using errcode = '42501';
    end if;
  end if;

  if new.status = 'completed' then
    new.progress_percent := 100;
    new.completed_at := coalesce(new.completed_at, clock_timestamp());
  elsif tg_op = 'UPDATE' and old.status = 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger action_items_normalize_progress
  before insert or update on public.action_items
  for each row execute function public.normalize_action_item_progress();

create or replace function public.touch_chat_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_sessions
  set last_message_at = new.created_at
  where id = new.session_id;
  return new;
end;
$$;

create trigger chat_messages_touch_session
  after insert on public.chat_messages
  for each row execute function public.touch_chat_session();

create or replace function public.write_audit_log(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_old_values jsonb default null,
  p_new_values jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not public.is_service_role() and not public.is_org_member(p_organization_id) then
    raise exception 'Not authorized to append an audit event for this organization'
      using errcode = '42501';
  end if;
  if p_action !~ '^[a-z][a-z0-9_.-]{1,119}$'
     or p_entity_type !~ '^[a-z][a-z0-9_]{1,79}$' then
    raise exception 'Invalid audit action or entity type' using errcode = '22023';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Audit metadata must be a JSON object' using errcode = '22023';
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id,
    old_values, new_values, metadata
  ) values (
    p_organization_id, auth.uid(), p_action, p_entity_type, p_entity_id,
    p_old_values, p_new_values, p_metadata
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.decide_approval(
  p_approval_request_id uuid,
  p_decision public.approval_decision_type,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approval_requests%rowtype;
  v_new_status public.approval_status;
  v_decision_id uuid;
begin
  select * into v_request
  from public.approval_requests
  where id = p_approval_request_id
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
  if char_length(p_notes) > 10000 then
    raise exception 'Approval notes exceed 10000 characters' using errcode = '22001';
  end if;

  v_new_status := p_decision::text::public.approval_status;

  insert into public.approval_decisions (
    organization_id, approval_request_id, reviewer_id, decision, notes,
    previous_status, new_status, analysis_version
  ) values (
    v_request.organization_id, v_request.id, auth.uid(), p_decision,
    coalesce(p_notes, ''), v_request.status, v_new_status, v_request.analysis_version
  ) returning id into v_decision_id;

  update public.approval_requests
  set status = v_new_status,
      resolved_at = clock_timestamp()
  where id = v_request.id;

  update public.policy_comparisons
  set status = case p_decision
        when 'approved' then 'approved'::public.comparison_status
        when 'rejected' then 'rejected'::public.comparison_status
        else 'revision_requested'::public.comparison_status
      end
  where id = v_request.comparison_id;

  if v_request.workflow_run_id is not null then
    update public.workflow_runs
    set status = case
          when p_decision = 'approved' then 'pending'::public.workflow_status
          else 'paused'::public.workflow_status
        end,
        current_node = case
          when p_decision = 'approved' then 'final_report'
          else 'revision'
        end,
        paused_at = case when p_decision = 'approved' then null else clock_timestamp() end,
        lease_owner = null,
        lease_expires_at = null
    where id = v_request.workflow_run_id;
  end if;

  perform public.write_audit_log(
    v_request.organization_id,
    'approval.decided',
    'approval_request',
    v_request.id::text,
    jsonb_build_object('status', v_request.status),
    jsonb_build_object('status', v_new_status, 'decision', p_decision),
    jsonb_build_object('analysisVersion', v_request.analysis_version)
  );

  return v_decision_id;
end;
$$;

create or replace function public.check_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_bucket_hash text;
  v_count integer;
begin
  if p_bucket_key is null or char_length(p_bucket_key) not between 1 and 512 then
    raise exception 'Rate-limit bucket key must contain 1 to 512 characters' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 10000 then
    raise exception 'Rate-limit maximum must be between 1 and 10000' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Rate-limit window must be between 1 and 86400 seconds' using errcode = '22023';
  end if;

  v_bucket_hash := encode(extensions.digest(convert_to(p_bucket_key, 'UTF8'), 'sha256'), 'hex');
  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  delete from public.rate_limit_buckets
  where bucket_key = v_bucket_hash
    and expires_at <= v_now;

  insert into public.rate_limit_buckets (
    bucket_key, window_started_at, request_count, expires_at, updated_at
  ) values (
    v_bucket_hash,
    v_window_start,
    1,
    v_window_start + make_interval(secs => p_window_seconds),
    v_now
  )
  on conflict (bucket_key, window_started_at) do update
    set request_count = public.rate_limit_buckets.request_count + 1,
        updated_at = v_now
    where public.rate_limit_buckets.request_count < p_limit
  returning request_count into v_count;

  return v_count is not null and v_count <= p_limit;
end;
$$;

revoke all on function public.current_user_id() from public;
revoke all on function public.is_service_role() from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, public.app_role[]) from public;
revoke all on function public.current_memberships() from public;
revoke all on function public.can_view_user(uuid) from public;
revoke all on function public.can_manage_user(uuid) from public;
revoke all on function public.can_access_department(uuid, uuid) from public;
revoke all on function public.can_access_document(uuid) from public;
revoke all on function public.can_view_comparison(uuid) from public;
revoke all on function public.owns_chat_session(uuid) from public;
revoke all on function public.storage_object_organization(text) from public;
revoke all on function public.write_audit_log(uuid, text, text, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.decide_approval(uuid, public.approval_decision_type, text) from public;
revoke all on function public.check_rate_limit(text, integer, integer) from public;

grant execute on function public.current_user_id() to authenticated, service_role;
grant execute on function public.is_service_role() to authenticated, service_role;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.has_org_role(uuid, public.app_role[]) to authenticated, service_role;
grant execute on function public.current_memberships() to authenticated, service_role;
grant execute on function public.can_view_user(uuid) to authenticated, service_role;
grant execute on function public.can_manage_user(uuid) to authenticated, service_role;
grant execute on function public.can_access_department(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_access_document(uuid) to authenticated, service_role;
grant execute on function public.can_view_comparison(uuid) to authenticated, service_role;
grant execute on function public.owns_chat_session(uuid) to authenticated, service_role;
grant execute on function public.storage_object_organization(text) to authenticated, service_role;
grant execute on function public.write_audit_log(uuid, text, text, text, jsonb, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.decide_approval(uuid, public.approval_decision_type, text) to authenticated, service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
