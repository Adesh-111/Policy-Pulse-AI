-- Close tenant-isolation and integrity gaps discovered during the production audit.
-- This is a forward-only migration so already-deployed environments receive the
-- same protections without rewriting their migration history.

-- A department-scoped user may inspect a comparison only when both source
-- documents are visible to that user. Governance roles retain organization-wide
-- access. In particular, an action-plan assignment alone must not reveal the raw
-- workflow state, report, or the other department's source evidence.
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
        or (
          public.has_org_role(
            pc.organization_id,
            array['department_user'::public.app_role]
          )
          and public.can_access_document(old_doc.id)
          and public.can_access_document(new_doc.id)
        )
      )
  );
$$;

comment on function public.can_view_comparison(uuid) is
  'Governance roles may view an organization comparison; department users must be authorized for both source documents.';

-- Re-state the policies for the full comparison artifacts so their security
-- boundary is explicit in this migration as well as inherited through the helper.
drop policy if exists policy_comparisons_authorized_select on public.policy_comparisons;
create policy policy_comparisons_authorized_select
on public.policy_comparisons for select to authenticated
using (public.can_view_comparison(id));

drop policy if exists workflow_runs_governance_select on public.workflow_runs;
create policy workflow_runs_governance_select
on public.workflow_runs for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array[
      'administrator'::public.app_role,
      'policy_manager'::public.app_role,
      'auditor'::public.app_role
    ]
  )
  or (comparison_id is not null and public.can_view_comparison(comparison_id))
);

drop policy if exists reports_authorized_select on public.reports;
create policy reports_authorized_select
on public.reports for select to authenticated
using (public.can_view_comparison(comparison_id));

drop policy if exists policy_documents_authorized_read on storage.objects;
create policy policy_documents_authorized_read
on storage.objects for select to authenticated
using (
  bucket_id = 'policy-documents'
  and public.storage_object_organization(name) is not null
  and (
    exists (
      select 1
      from public.documents d
      where d.storage_bucket = bucket_id
        and d.storage_path = name
        and public.can_access_document(d.id)
    )
    or exists (
      select 1
      from public.reports r
      where r.storage_bucket = bucket_id
        and r.storage_path = name
        and r.organization_id = public.storage_object_organization(name)
        and public.can_view_comparison(r.comparison_id)
    )
  )
);

alter table public.reports
  drop constraint if exists reports_storage_path_scope_check;
alter table public.reports
  add constraint reports_storage_path_scope_check check (
    storage_path is null
    or storage_path like organization_id::text || '/reports/%'
  );

-- The generic audit function is intentionally unavailable to browser roles.
-- Trusted security-definer RPCs can still invoke it as their owning role, and
-- server-side application mutations write through the service-role client.
revoke all on function public.write_audit_log(
  uuid, text, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.write_audit_log(
  uuid, text, text, text, jsonb, jsonb, jsonb
) to service_role;

-- GoTrue invitations are distinguishable from self-registration through the
-- server-owned auth.users.invited_at value. Never bootstrap a personal tenant
-- from user metadata for an invited account, even if organization_name appears.
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

  v_organization_name := nullif(btrim(new.raw_user_meta_data ->> 'organization_name'), '');
  if new.invited_at is null and v_organization_name is not null then
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

-- Only the authenticated invitee can activate their own pre-created membership.
-- The row lock makes acceptance idempotent and keeps membership/profile/audit
-- changes in one database transaction.
create or replace function public.accept_current_user_invitation(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.memberships%rowtype;
  v_was_invited boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into v_membership
  from public.memberships
  where organization_id = p_organization_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_membership.status = 'suspended' then
    raise exception 'Invitation is no longer active' using errcode = '42501';
  end if;
  if v_membership.role = 'department_user' and v_membership.department_id is null then
    raise exception 'Department invitation is missing its department scope'
      using errcode = '23514';
  end if;

  v_was_invited := v_membership.status = 'invited';
  if v_was_invited then
    update public.memberships
    set status = 'active',
        joined_at = coalesce(joined_at, clock_timestamp())
    where id = v_membership.id
    returning * into v_membership;

    update public.profiles
    set default_organization_id = v_membership.organization_id,
        department_id = v_membership.department_id
    where id = auth.uid();

    perform public.write_audit_log(
      v_membership.organization_id,
      'membership.accepted',
      'membership',
      v_membership.id::text,
      jsonb_build_object('status', 'invited'),
      jsonb_build_object('status', 'active', 'joinedAt', v_membership.joined_at),
      '{}'::jsonb
    );
  end if;

  return jsonb_build_object(
    'membershipId', v_membership.id,
    'organizationId', v_membership.organization_id,
    'status', v_membership.status,
    'accepted', v_was_invited
  );
end;
$$;

revoke all on function public.accept_current_user_invitation(uuid)
  from public, anon;
grant execute on function public.accept_current_user_invitation(uuid)
  to authenticated, service_role;

-- Retire duplicate active runs before adding the invariant. Prefer the run that
-- has progressed furthest, then the most recently updated run.
with ranked as (
  select
    id,
    row_number() over (
      partition by comparison_id
      order by
        case status
          when 'running' then 1
          when 'awaiting_approval' then 2
          when 'paused' then 3
          when 'retry_scheduled' then 4
          else 5
        end,
        updated_at desc,
        created_at desc,
        id
    ) as active_rank
  from public.workflow_runs
  where comparison_id is not null
    and status in ('pending', 'running', 'paused', 'awaiting_approval', 'retry_scheduled')
), duplicate_runs as (
  select id from ranked where active_rank > 1
)
update public.background_jobs job
set status = 'cancelled',
    lease_owner = null,
    lease_expires_at = null,
    completed_at = coalesce(completed_at, clock_timestamp()),
    last_error = coalesce(
      last_error,
      jsonb_build_object('code', 'SUPERSEDED_ACTIVE_RUN')
    )
where job.workflow_run_id in (select id from duplicate_runs)
  and job.status in ('queued', 'running', 'retry_scheduled');

with ranked as (
  select
    id,
    row_number() over (
      partition by comparison_id
      order by
        case status
          when 'running' then 1
          when 'awaiting_approval' then 2
          when 'paused' then 3
          when 'retry_scheduled' then 4
          else 5
        end,
        updated_at desc,
        created_at desc,
        id
    ) as active_rank
  from public.workflow_runs
  where comparison_id is not null
    and status in ('pending', 'running', 'paused', 'awaiting_approval', 'retry_scheduled')
)
update public.workflow_runs run
set status = 'cancelled',
    lease_owner = null,
    lease_expires_at = null,
    completed_at = coalesce(completed_at, clock_timestamp()),
    last_error = coalesce(
      last_error,
      jsonb_build_object(
        'code', 'SUPERSEDED_ACTIVE_RUN',
        'message', 'A newer or further-progressed active run was retained.'
      )
    )
from ranked
where run.id = ranked.id
  and ranked.active_rank > 1;

create unique index workflow_runs_one_active_per_comparison
  on public.workflow_runs (comparison_id)
  where comparison_id is not null
    and status in ('pending', 'running', 'paused', 'awaiting_approval', 'retry_scheduled');

alter table public.workflow_runs
  add column manual_retry_count integer not null default 0
  check (manual_retry_count >= 0);

-- Starting a comparison now locks the comparison, creates/reuses the sole active
-- workflow run, updates comparison state, and queues its first job atomically.
create or replace function public.start_policy_comparison_workflow(
  p_comparison_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comparison public.policy_comparisons%rowtype;
  v_run public.workflow_runs%rowtype;
  v_job public.background_jobs%rowtype;
  v_thread_id text;
  v_created boolean := false;
  v_idempotency_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into v_comparison
  from public.policy_comparisons
  where id = p_comparison_id
  for update;

  if not found or not public.has_org_role(
    v_comparison.organization_id,
    array['administrator'::public.app_role, 'policy_manager'::public.app_role]
  ) then
    raise exception 'Comparison not found' using errcode = 'P0002';
  end if;

  select * into v_run
  from public.workflow_runs
  where comparison_id = v_comparison.id
    and organization_id = v_comparison.organization_id
    and status in ('pending', 'running', 'paused', 'awaiting_approval', 'retry_scheduled')
  order by created_at desc
  limit 1
  for update;

  if not found then
    if v_comparison.status <> 'draft' then
      raise exception 'Comparison is not startable in its current state'
        using errcode = '55000';
    end if;
    v_thread_id := gen_random_uuid()::text;
    begin
      insert into public.workflow_runs (
        organization_id,
        comparison_id,
        thread_id,
        status,
        current_node,
        state,
        input,
        created_by,
        max_retries
      ) values (
        v_comparison.organization_id,
        v_comparison.id,
        v_thread_id,
        'pending',
        'document_validation',
        jsonb_build_object(
          'runId', v_thread_id,
          'organizationId', v_comparison.organization_id,
          'comparisonId', v_comparison.id,
          'analysisVersion', v_comparison.analysis_version,
          'actorId', auth.uid(),
          'oldDocumentId', v_comparison.old_document_id,
          'newDocumentId', v_comparison.new_document_id,
          'retrievalAttempt', 0,
          'automaticRevisionCount', 0,
          'warnings', jsonb_build_array(),
          'safeErrors', jsonb_build_array()
        ),
        jsonb_build_object(
          'old_document_id', v_comparison.old_document_id,
          'new_document_id', v_comparison.new_document_id
        ),
        auth.uid(),
        5
      )
      returning * into v_run;
      v_created := true;
    exception when unique_violation then
      select * into v_run
      from public.workflow_runs
      where comparison_id = v_comparison.id
        and status in ('pending', 'running', 'paused', 'awaiting_approval', 'retry_scheduled')
      order by created_at desc
      limit 1
      for update;
    end;
  end if;

  if v_created then
    update public.policy_comparisons
    set status = 'queued',
        started_at = coalesce(started_at, clock_timestamp()),
        completed_at = null,
        failure_reason = null
    where id = v_comparison.id;

    v_idempotency_key := format(
      'analysis:%s:v%s:run:%s',
      v_comparison.id,
      v_comparison.analysis_version,
      v_run.id
    );
    insert into public.background_jobs (
      organization_id,
      workflow_run_id,
      job_type,
      subject_type,
      subject_id,
      idempotency_key,
      payload,
      status,
      max_attempts,
      next_attempt_at
    ) values (
      v_comparison.organization_id,
      v_run.id,
      'advance_policy_analysis',
      'policy_comparison',
      v_comparison.id::text,
      v_idempotency_key,
      '{}'::jsonb,
      'queued',
      5,
      clock_timestamp()
    )
    returning * into v_job;

    perform public.write_audit_log(
      v_comparison.organization_id,
      'comparison.started',
      'workflow_run',
      v_run.id::text,
      null,
      jsonb_build_object(
        'comparisonId', v_comparison.id,
        'analysisVersion', v_comparison.analysis_version
      ),
      jsonb_strip_nulls(jsonb_build_object('requestId', p_request_id))
    );
  else
    select * into v_job
    from public.background_jobs
    where workflow_run_id = v_run.id
      and status in ('queued', 'running', 'retry_scheduled')
    order by created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'created', v_created,
    'analysisVersion', v_comparison.analysis_version,
    'run', to_jsonb(v_run),
    'job', case
      when v_job.id is null then null
      else jsonb_build_object('id', v_job.id, 'status', v_job.status)
    end
  );
end;
$$;

-- Manual retry generations live on the workflow row. The row lock and active-job
-- check coalesce concurrent clicks into one job; the persisted generation makes
-- each later retry key stable without timestamps.
create or replace function public.queue_workflow_retry(
  p_workflow_run_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.workflow_runs%rowtype;
  v_job public.background_jobs%rowtype;
  v_retry_generation integer;
  v_idempotency_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into v_run
  from public.workflow_runs
  where id = p_workflow_run_id
  for update;

  if not found or not public.has_org_role(
    v_run.organization_id,
    array['administrator'::public.app_role, 'policy_manager'::public.app_role]
  ) then
    raise exception 'Workflow run not found' using errcode = 'P0002';
  end if;
  if v_run.status in ('completed', 'cancelled', 'awaiting_approval') then
    raise exception 'Workflow is not retryable in its current state'
      using errcode = '55000';
  end if;
  if v_run.comparison_id is null then
    raise exception 'Only comparison workflows support manual retry'
      using errcode = '55000';
  end if;

  select * into v_job
  from public.background_jobs
  where workflow_run_id = v_run.id
    and status in ('queued', 'running', 'retry_scheduled')
  order by created_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'created', false,
      'runId', v_run.id,
      'status', v_run.status,
      'job', jsonb_build_object('id', v_job.id, 'status', v_job.status)
    );
  end if;

  update public.workflow_runs
  set manual_retry_count = manual_retry_count + 1,
      status = 'retry_scheduled',
      next_retry_at = clock_timestamp(),
      lease_owner = null,
      lease_expires_at = null,
      last_error = null
  where id = v_run.id
  returning * into v_run;

  v_retry_generation := v_run.manual_retry_count;
  v_idempotency_key := format('manual:%s:g%s', v_run.id, v_retry_generation);
  insert into public.background_jobs (
    organization_id,
    workflow_run_id,
    job_type,
    subject_type,
    subject_id,
    node_name,
    idempotency_key,
    payload,
    status,
    max_attempts,
    next_attempt_at
  ) values (
    v_run.organization_id,
    v_run.id,
    'advance_policy_analysis',
    'policy_comparison',
    v_run.comparison_id::text,
    v_run.current_node,
    v_idempotency_key,
    jsonb_build_object('manualRetry', true, 'requestedBy', auth.uid()),
    'queued',
    5,
    clock_timestamp()
  )
  returning * into v_job;

  perform public.write_audit_log(
    v_run.organization_id,
    'workflow.retry_queued',
    'workflow_run',
    v_run.id::text,
    null,
    jsonb_build_object(
      'generation', v_retry_generation,
      'node', v_run.current_node,
      'jobId', v_job.id
    ),
    jsonb_strip_nulls(jsonb_build_object('requestId', p_request_id))
  );

  return jsonb_build_object(
    'created', true,
    'runId', v_run.id,
    'status', v_run.status,
    'job', jsonb_build_object('id', v_job.id, 'status', v_job.status)
  );
end;
$$;

revoke all on function public.start_policy_comparison_workflow(uuid, text)
  from public, anon;
revoke all on function public.queue_workflow_retry(uuid, text)
  from public, anon;
grant execute on function public.start_policy_comparison_workflow(uuid, text)
  to authenticated, service_role;
grant execute on function public.queue_workflow_retry(uuid, text)
  to authenticated, service_role;

-- Keep the evaluation corpus as an installation-owned versioned template, then
-- materialize tenant-local rows. The private schema has no browser grants, and
-- workers continue to query only evaluation_questions for their organization.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.evaluation_question_templates (
  suite_version integer not null check (suite_version > 0),
  external_id text not null check (external_id ~ '^eval-[0-9]{3,}$'),
  question text not null,
  expected_answer text not null,
  category text not null,
  expected_sources jsonb not null check (jsonb_typeof(expected_sources) = 'array'),
  expected_change_types public.change_type[] not null default '{}'::public.change_type[],
  expected_risk public.risk_level,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  tags text[] not null default '{}'::text[],
  primary key (suite_version, external_id)
);

revoke all on table private.evaluation_question_templates
  from public, anon, authenticated;

insert into private.evaluation_question_templates (
  suite_version, external_id, question, expected_answer, category,
  expected_sources, expected_change_types, expected_risk, difficulty, tags
)
values
  (1, 'eval-001', 'What is the new minimum attendance requirement and what did it replace?', 'The new policy requires 80% attendance in each course, replacing 75% in each course.', 'change_detection', '[{"file":"attendance-policy-old.md","section":"2. Minimum attendance"},{"file":"attendance-policy-new.md","section":"2. Minimum attendance"}]', array['modified'::public.change_type], 'high', 'easy', array['attendance','threshold']),
  (1, 'eval-002', 'How did medical attendance condonation change?', 'The cap fell from 10 points to five, the deadline moved from seven calendar days to three business days, and a review panel replaced the Head of Department as decision maker.', 'change_detection', '[{"file":"attendance-policy-old.md","section":"3. Medical condonation"},{"file":"attendance-policy-new.md","section":"3. Medical and disability-related exemption"}]', array['modified'::public.change_type,'deadline_change'::public.change_type,'responsibility_change'::public.change_type], 'high', 'medium', array['attendance','medical']),
  (1, 'eval-003', 'What attendance level does the new policy require for laboratory and clinical courses?', 'It requires 85%, unless a statutory council requires more.', 'change_detection', '[{"file":"attendance-policy-new.md","section":"2. Minimum attendance"}]', array['added'::public.change_type], 'medium', 'easy', array['attendance','laboratory']),
  (1, 'eval-004', 'Which units gained new responsibilities under the attendance revision?', 'Academic Affairs operates monitoring, advisors document intervention, and the Medical and Accessibility Review Panel decides exemptions.', 'department_impact', '[{"file":"attendance-policy-new.md","section":"6. Responsibility"}]', array['responsibility_change'::public.change_type], 'medium', 'medium', array['attendance','departments']),
  (1, 'eval-005', 'How quickly must marks be submitted under the new examination policy?', 'Departments must submit approved marks within five calendar days after the examination, replacing ten calendar days.', 'change_detection', '[{"file":"examinations-policy-old.md","section":"5. Mark submission"},{"file":"examinations-policy-new.md","section":"5. Mark submission"}]', array['deadline_change'::public.change_type,'responsibility_change'::public.change_type], 'high', 'easy', array['examinations','deadline']),
  (1, 'eval-006', 'What changed for question-paper submission?', 'The deadline changed from ten business days to fifteen calendar days, using a secure portal with department moderation, metadata, and accessibility checks.', 'change_detection', '[{"file":"examinations-policy-old.md","section":"2. Question papers"},{"file":"examinations-policy-new.md","section":"2. Question papers"}]', array['deadline_change'::public.change_type,'responsibility_change'::public.change_type,'compliance_requirement'::public.change_type], 'high', 'medium', array['examinations','security']),
  (1, 'eval-007', 'How long are examination records retained under the new policy?', 'Seven years after result publication, replacing five years.', 'change_detection', '[{"file":"examinations-policy-old.md","section":"7. Results and corrections"},{"file":"examinations-policy-new.md","section":"7. Results, corrections, and retention"}]', array['modified'::public.change_type], 'medium', 'easy', array['examinations','retention']),
  (1, 'eval-008', 'May students use generative AI in a graded assignment under the new student AI policy?', 'Only when the assessment brief expressly permits it and defines allowed functions; silence and independent assessments mean prohibited.', 'change_detection', '[{"file":"student-ai-usage-policy-new.md","section":"1. Permission model"}]', array['exception_added'::public.change_type,'modified'::public.change_type], 'high', 'easy', array['ai','students']),
  (1, 'eval-009', 'What disclosure is required when student AI use is permitted?', 'The student names the tool, date, purpose, and influence and retains material prompts and outputs through the appeal period.', 'compliance_requirement', '[{"file":"student-ai-usage-policy-new.md","section":"2. Disclosure and evidence"}]', array['compliance_requirement'::public.change_type,'added'::public.change_type], 'medium', 'medium', array['ai','disclosure']),
  (1, 'eval-010', 'Do the new student AI and faculty responsibility policies agree about AI-assisted graded work?', 'No. The student policy conditionally permits it while the faculty policy requires every graded assignment to prohibit generated content.', 'conflict_detection', '[{"file":"student-ai-usage-policy-new.md","section":"1. Permission model"},{"file":"faculty-responsibilities-policy-new.md","section":"4. Artificial intelligence in graded work"}]', array[]::public.change_type[], 'critical', 'hard', array['ai','conflict']),
  (1, 'eval-011', 'What student-record retention period changed in the privacy policy?', 'Routine records moved from a general five-year period to three years after the last active relationship, with separate permanent and seven-year categories.', 'change_detection', '[{"file":"data-privacy-policy-old.md","section":"4. Retention"},{"file":"data-privacy-policy-new.md","section":"4. Retention schedule"}]', array['modified'::public.change_type], 'high', 'medium', array['privacy','retention']),
  (1, 'eval-012', 'What is the new deadline for reporting a suspected data incident?', 'Within 24 hours of discovery to the service desk and Data Protection Office.', 'change_detection', '[{"file":"data-privacy-policy-new.md","section":"5. Incident response"}]', array['deadline_change'::public.change_type,'responsibility_change'::public.change_type], 'high', 'easy', array['privacy','incident']),
  (1, 'eval-013', 'What must each department do under the new privacy policy?', 'Appoint a data steward to maintain an inventory, review access quarterly, coordinate deletion, and support rights-request searches.', 'department_impact', '[{"file":"data-privacy-policy-new.md","section":"2. Distributed responsibility"},{"file":"data-privacy-policy-new.md","section":"6. Individual rights requests"}]', array['responsibility_change'::public.change_type,'compliance_requirement'::public.change_type], 'high', 'medium', array['privacy','departments']),
  (1, 'eval-014', 'How did the baseline placement CGPA requirement change?', 'It rose from 6.5 to 7.0 on a ten-point scale.', 'change_detection', '[{"file":"placement-eligibility-policy-old.md","section":"1. Baseline eligibility"},{"file":"placement-eligibility-policy-new.md","section":"1. Baseline eligibility"}]', array['eligibility_change'::public.change_type], 'high', 'easy', array['placement','cgpa']),
  (1, 'eval-015', 'Did the backlog rule become stricter or more permissive in the new placement policy?', 'More permissive: it moved from no active backlog to one, though employers may be stricter.', 'change_detection', '[{"file":"placement-eligibility-policy-old.md","section":"1. Baseline eligibility"},{"file":"placement-eligibility-policy-new.md","section":"1. Baseline eligibility"}]', array['eligibility_change'::public.change_type,'exception_added'::public.change_type], 'medium', 'medium', array['placement','backlog']),
  (1, 'eval-016', 'Is the placement attendance requirement consistent with the new general attendance policy?', 'No. Placement uses 75% per course while the attendance policy requires 80%, or 85% for laboratory and clinical courses.', 'conflict_detection', '[{"file":"placement-eligibility-policy-new.md","section":"1. Baseline eligibility"},{"file":"attendance-policy-new.md","section":"2. Minimum attendance"}]', array[]::public.change_type[], 'critical', 'hard', array['placement','attendance','conflict']),
  (1, 'eval-017', 'When must faculty publish course and assessment information under the new policy?', 'Within five business days after classes begin, replacing ten business days.', 'change_detection', '[{"file":"faculty-responsibilities-policy-old.md","section":"1. Course preparation"},{"file":"faculty-responsibilities-policy-new.md","section":"1. Course preparation"}]', array['deadline_change'::public.change_type], 'medium', 'easy', array['faculty','deadline']),
  (1, 'eval-018', 'How did the coursework feedback deadline change for faculty?', 'It shortened from 15 business days to 10 business days, with a recorded cohort-wide extension.', 'change_detection', '[{"file":"faculty-responsibilities-policy-old.md","section":"3. Assessment and feedback"},{"file":"faculty-responsibilities-policy-new.md","section":"3. Assessment and feedback"}]', array['deadline_change'::public.change_type,'exception_added'::public.change_type], 'medium', 'easy', array['faculty','feedback']),
  (1, 'eval-019', 'How do the new faculty and examination mark deadlines fit together?', 'Faculty submit to the department in four calendar days so it can validate and meet the five-calendar-day institutional deadline.', 'cross_policy_alignment', '[{"file":"faculty-responsibilities-policy-new.md","section":"5. Examination duties"},{"file":"examinations-policy-new.md","section":"5. Mark submission"}]', array['deadline_change'::public.change_type,'responsibility_change'::public.change_type], 'high', 'hard', array['faculty','examinations']),
  (1, 'eval-020', 'Which bundled policy conflicts should be treated as critical?', 'The student-versus-faculty AI permission conflict and the placement 75% versus attendance 80%/85% threshold conflict.', 'risk_assessment', '[{"file":"student-ai-usage-policy-new.md","section":"1. Permission model"},{"file":"faculty-responsibilities-policy-new.md","section":"4. Artificial intelligence in graded work"},{"file":"placement-eligibility-policy-new.md","section":"1. Baseline eligibility"},{"file":"attendance-policy-new.md","section":"2. Minimum attendance"}]', array[]::public.change_type[], 'critical', 'hard', array['conflict','risk']),
  (1, 'eval-021', 'What is the cafeteria refund policy for unused meal credits?', 'I could not find sufficient evidence in the uploaded policies.', 'insufficient_evidence', '[]', array[]::public.change_type[], null, 'easy', array['insufficient-evidence']),
  (1, 'eval-022', 'Who may reopen a locked mark sheet under the old and new policies?', 'The old policy allowed only the Controller; the new policy requires the Head of Department and Controller together.', 'citation_correctness', '[{"file":"examinations-policy-old.md","section":"5. Mark submission"},{"file":"examinations-policy-new.md","section":"5. Mark submission"}]', array['responsibility_change'::public.change_type,'compliance_requirement'::public.change_type], 'medium', 'medium', array['examinations','approval']),
  (1, 'eval-023', 'What should the Examination Office change before implementing the new policies?', 'Use the central eligibility list, secure paper portal, second mark validation, standing accommodations, two-person reopening, and seven-year retention.', 'department_impact', '[{"file":"examinations-policy-new.md","section":"3. Candidate eligibility"},{"file":"examinations-policy-new.md","section":"5. Mark submission"},{"file":"examinations-policy-new.md","section":"7. Results, corrections, and retention"}]', array['responsibility_change'::public.change_type,'compliance_requirement'::public.change_type,'deadline_change'::public.change_type], 'high', 'hard', array['examinations','action-plan']),
  (1, 'eval-024', 'Are the new privacy and examination policies aligned on examination-record retention?', 'Yes. Both use seven years after results and both preserve records under applicable holds.', 'cross_policy_alignment', '[{"file":"data-privacy-policy-new.md","section":"4. Retention schedule"},{"file":"examinations-policy-new.md","section":"7. Results, corrections, and retention"}]', array[]::public.change_type[], 'low', 'medium', array['privacy','examinations','retention'])
on conflict (suite_version, external_id) do update
set question = excluded.question,
    expected_answer = excluded.expected_answer,
    category = excluded.category,
    expected_sources = excluded.expected_sources,
    expected_change_types = excluded.expected_change_types,
    expected_risk = excluded.expected_risk,
    difficulty = excluded.difficulty,
    tags = excluded.tags;

alter table public.evaluation_questions
  add column suite_version integer not null default 1
  check (suite_version > 0);

alter table public.evaluation_questions
  drop constraint if exists evaluation_questions_organization_id_external_id_key;
alter table public.evaluation_questions
  add constraint evaluation_questions_organization_suite_external_key
  unique (organization_id, suite_version, external_id);

create or replace function private.enforce_single_active_evaluation_suite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active then
    update public.evaluation_questions
    set is_active = false
    where organization_id = new.organization_id
      and suite_version <> new.suite_version
      and is_active;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_single_active_evaluation_suite()
  from public, anon, authenticated;

drop trigger if exists evaluation_questions_single_active_suite
  on public.evaluation_questions;
create trigger evaluation_questions_single_active_suite
  before insert or update of organization_id, suite_version, is_active
  on public.evaluation_questions
  for each row execute function private.enforce_single_active_evaluation_suite();

create or replace function private.provision_evaluation_suite(
  p_organization_id uuid,
  p_suite_version integer default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suite_version integer;
  v_row_count integer;
begin
  select coalesce(p_suite_version, max(suite_version))
  into v_suite_version
  from private.evaluation_question_templates;

  if v_suite_version is null or not exists (
    select 1
    from private.evaluation_question_templates
    where suite_version = v_suite_version
  ) then
    raise exception 'No evaluation suite template is installed' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.organizations where id = p_organization_id
  ) then
    raise exception 'Organization not found' using errcode = 'P0002';
  end if;

  update public.evaluation_questions question
  set is_active = false
  where question.organization_id = p_organization_id
    and question.is_active
    and (
      question.suite_version <> v_suite_version
      or not exists (
        select 1
        from private.evaluation_question_templates template
        where template.suite_version = v_suite_version
          and template.external_id = question.external_id
      )
    );

  insert into public.evaluation_questions (
    organization_id,
    external_id,
    question,
    expected_answer,
    category,
    expected_sources,
    expected_change_types,
    expected_risk,
    difficulty,
    tags,
    suite_version,
    is_active
  )
  select
    p_organization_id,
    template.external_id,
    template.question,
    template.expected_answer,
    template.category,
    template.expected_sources,
    template.expected_change_types,
    template.expected_risk,
    template.difficulty,
    template.tags,
    template.suite_version,
    true
  from private.evaluation_question_templates template
  where template.suite_version = v_suite_version
  on conflict (organization_id, suite_version, external_id) do update
  set is_active = true;

  get diagnostics v_row_count = row_count;
  return v_row_count;
end;
$$;

create or replace function private.provision_evaluation_suite_for_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.provision_evaluation_suite(new.id, null);
  return new;
end;
$$;

revoke all on function private.provision_evaluation_suite(uuid, integer)
  from public, anon, authenticated;
revoke all on function private.provision_evaluation_suite_for_organization()
  from public, anon, authenticated;

drop trigger if exists organizations_provision_evaluation_suite on public.organizations;
create trigger organizations_provision_evaluation_suite
  after insert on public.organizations
  for each row execute function private.provision_evaluation_suite_for_organization();

-- Backfill every existing organization with its own independent question rows.
select private.provision_evaluation_suite(id, null)
from public.organizations;

comment on table private.evaluation_question_templates is
  'Installation-owned versioned evaluation corpus. Browser roles receive tenant-local copies only.';
comment on column public.evaluation_questions.suite_version is
  'Version of the installation-owned evaluation template materialized for this tenant.';
