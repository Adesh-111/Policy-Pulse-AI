begin;

create extension if not exists pgtap with schema extensions;
select plan(42);

select is(
  (
    select count(*)::integer
    from private.evaluation_question_templates
    where suite_version = 1
  ),
  24,
  'evaluation suite version 1 contains exactly twenty-four templates'
);
select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated clients cannot inspect installation-owned templates'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.write_audit_log(uuid,text,text,text,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot forge generic audit events'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.write_audit_log(uuid,text,text,text,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'the trusted service role can append generic audit events'
);
select ok(
  exists (
    select 1
    from pg_index index_definition
    join pg_class index_relation on index_relation.oid = index_definition.indexrelid
    where index_relation.relname = 'workflow_runs_one_active_per_comparison'
      and index_definition.indisunique
      and pg_get_expr(index_definition.indpred, index_definition.indrelid)
        like '%retry_scheduled%'
  ),
  'a partial unique index enforces one active workflow per comparison'
);
select ok(
  to_regprocedure('public.accept_current_user_invitation(uuid)') is not null,
  'invitation acceptance RPC exists'
);
select ok(
  to_regprocedure('public.start_policy_comparison_workflow(uuid,text)') is not null,
  'atomic workflow start RPC exists'
);
select ok(
  to_regprocedure('public.queue_workflow_retry(uuid,text)') is not null,
  'serialized workflow retry RPC exists'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'policy_documents_authorized_read'
      and qual like '%can_view_comparison%'
  ),
  'stored reports inherit the hardened comparison authorization helper'
);

insert into public.organizations (id, name, slug)
values (
  '91000000-0000-4000-8000-000000000001',
  'Security Integrity Fixture',
  'security-integrity-fixture'
);

insert into public.departments (id, organization_id, code, name)
values
  (
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'DEPT_A',
    'Department A'
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000001',
    'DEPT_B',
    'Department B'
  );

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-integrity@example.test', '', clock_timestamp(), null, '{"provider":"email","providers":["email"]}', '{"full_name":"Admin Fixture"}', clock_timestamp(), clock_timestamp(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'manager-integrity@example.test', '', clock_timestamp(), null, '{"provider":"email","providers":["email"]}', '{"full_name":"Manager Fixture"}', clock_timestamp(), clock_timestamp(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'auditor-integrity@example.test', '', clock_timestamp(), null, '{"provider":"email","providers":["email"]}', '{"full_name":"Auditor Fixture"}', clock_timestamp(), clock_timestamp(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'department-a-integrity@example.test', '', clock_timestamp(), null, '{"provider":"email","providers":["email"]}', '{"full_name":"Department A Fixture"}', clock_timestamp(), clock_timestamp(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'department-b-integrity@example.test', '', clock_timestamp(), null, '{"provider":"email","providers":["email"]}', '{"full_name":"Department B Fixture"}', clock_timestamp(), clock_timestamp(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'invite-integrity@example.test', '', null, clock_timestamp(), '{"provider":"email","providers":["email"]}', '{"full_name":"Invited Fixture","organization_name":"Must Not Bootstrap"}', clock_timestamp(), clock_timestamp(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '93000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'signup-integrity@example.test', '', clock_timestamp(), null, '{"provider":"email","providers":["email"]}', '{"full_name":"Signup Fixture","organization_name":"Signup Evaluation Tenant"}', clock_timestamp(), clock_timestamp(), '', '', '', '');

select is(
  (select count(*)::integer from public.organizations where name = 'Must Not Bootstrap'),
  0,
  'GoTrue invitations never bootstrap a personal organization from metadata'
);

insert into public.memberships (
  organization_id, user_id, role, department_id, status, invited_at, joined_at
)
values
  ('91000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'administrator', null, 'active', clock_timestamp(), clock_timestamp()),
  ('91000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000002', 'policy_manager', null, 'active', clock_timestamp(), clock_timestamp()),
  ('91000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000003', 'auditor', null, 'active', clock_timestamp(), clock_timestamp()),
  ('91000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000004', 'department_user', '92000000-0000-4000-8000-000000000001', 'active', clock_timestamp(), clock_timestamp()),
  ('91000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000005', 'department_user', '92000000-0000-4000-8000-000000000002', 'active', clock_timestamp(), clock_timestamp()),
  ('91000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000006', 'department_user', '92000000-0000-4000-8000-000000000001', 'invited', clock_timestamp(), null);

insert into public.documents (
  id,
  organization_id,
  department_id,
  title,
  category,
  version,
  designation,
  original_filename,
  mime_type,
  file_extension,
  file_size_bytes,
  storage_path,
  processing_status,
  indexed_at
)
values
  (
    '94000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'Department A old policy',
    'Security',
    '1.0',
    'old',
    'department-a-old.md',
    'text/markdown',
    'md',
    100,
    '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/department-a-old.md',
    'indexed',
    clock_timestamp()
  ),
  (
    '94000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002',
    'Department B new policy',
    'Security',
    '2.0',
    'new',
    'department-b-new.md',
    'text/markdown',
    'md',
    100,
    '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000002/department-b-new.md',
    'indexed',
    clock_timestamp()
  );

insert into public.policy_comparisons (
  id, organization_id, old_document_id, new_document_id, title, status
)
values
  ('95000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002', 'Cross department artifact fixture', 'draft'),
  ('95000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002', 'Atomic workflow start fixture', 'draft');

insert into public.workflow_runs (
  id, organization_id, comparison_id, thread_id, status, current_node,
  state, input, completed_at
)
values (
  '96000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  'security-integrity-completed',
  'completed',
  'final_report',
  '{"sensitiveEvidence":"department-b"}',
  '{}',
  clock_timestamp()
);

insert into public.reports (
  id, organization_id, comparison_id, format, title, content
)
values (
  '97000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  'markdown',
  'Cross department report fixture',
  'Department B evidence'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  public.can_view_comparison('95000000-0000-4000-8000-000000000001'),
  'administrator retains organization-wide comparison access'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  public.can_view_comparison('95000000-0000-4000-8000-000000000001'),
  'policy manager retains organization-wide comparison access'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  public.can_view_comparison('95000000-0000-4000-8000-000000000001'),
  'auditor retains organization-wide comparison access'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  not public.can_view_comparison('95000000-0000-4000-8000-000000000001'),
  'department A user cannot view a comparison when only the old document is visible'
);
select is(
  (select count(*)::integer from public.policy_comparisons where id = '95000000-0000-4000-8000-000000000001'),
  0,
  'comparison row is hidden from a single-document department user'
);
select is(
  (select count(*)::integer from public.workflow_runs where id = '96000000-0000-4000-8000-000000000001'),
  0,
  'raw workflow state is hidden from a single-document department user'
);
select is(
  (select count(*)::integer from public.reports where id = '97000000-0000-4000-8000-000000000001'),
  0,
  'full report is hidden from a single-document department user'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  not public.can_view_comparison('95000000-0000-4000-8000-000000000001'),
  'department B user cannot view a comparison when only the new document is visible'
);
reset role;

insert into public.document_departments (document_id, department_id, organization_id)
values (
  '94000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  public.can_view_comparison('95000000-0000-4000-8000-000000000001'),
  'department user can view a comparison only after both documents are visible'
);
select is(
  (select count(*)::integer from public.policy_comparisons where id = '95000000-0000-4000-8000-000000000001'),
  1,
  'comparison row becomes visible after both-document authorization'
);
select is(
  (select count(*)::integer from public.workflow_runs where id = '96000000-0000-4000-8000-000000000001'),
  1,
  'workflow state becomes visible after both-document authorization'
);
select is(
  (select count(*)::integer from public.reports where id = '97000000-0000-4000-8000-000000000001'),
  1,
  'report becomes visible after both-document authorization'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;
select lives_ok(
  $$select public.accept_current_user_invitation('91000000-0000-4000-8000-000000000001')$$,
  'invitee can atomically accept only their own invitation'
);
reset role;

select is(
  (
    select status::text
    from public.memberships
    where organization_id = '91000000-0000-4000-8000-000000000001'
      and user_id = '93000000-0000-4000-8000-000000000006'
  ),
  'active',
  'accepted membership is active'
);
select ok(
  (
    select joined_at is not null
    from public.memberships
    where organization_id = '91000000-0000-4000-8000-000000000001'
      and user_id = '93000000-0000-4000-8000-000000000006'
  ),
  'accepted membership records joined_at'
);

set local role authenticated;
select is(
  (
    public.accept_current_user_invitation(
      '91000000-0000-4000-8000-000000000001'
    ) ->> 'accepted'
  ),
  'false',
  'invitation acceptance is idempotent'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.memberships membership
    join public.organizations organization on organization.id = membership.organization_id
    where membership.user_id = '93000000-0000-4000-8000-000000000007'
      and membership.status = 'active'
      and organization.name = 'Signup Evaluation Tenant'
  ),
  1,
  'self-registration still bootstraps exactly one active administrator tenant'
);
select is(
  (
    select count(*)::integer
    from public.evaluation_questions question
    join public.organizations organization on organization.id = question.organization_id
    where organization.name = 'Signup Evaluation Tenant'
      and question.suite_version = 1
      and question.is_active
  ),
  24,
  'new signup tenant receives the complete versioned evaluation suite'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.evaluation_questions where is_active),
  24,
  'evaluation questions remain tenant-local under RLS'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (
    public.start_policy_comparison_workflow(
      '95000000-0000-4000-8000-000000000002',
      'pgtap-start-1'
    ) ->> 'created'
  ),
  'true',
  'first start atomically creates and queues a workflow run'
);
select is(
  (
    public.start_policy_comparison_workflow(
      '95000000-0000-4000-8000-000000000002',
      'pgtap-start-2'
    ) ->> 'created'
  ),
  'false',
  'repeated start reuses the active workflow run'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.workflow_runs
    where comparison_id = '95000000-0000-4000-8000-000000000002'
      and status in ('pending', 'running', 'paused', 'awaiting_approval', 'retry_scheduled')
  ),
  1,
  'database contains only one active run for the comparison'
);
select is(
  (
    select count(*)::integer
    from public.background_jobs
    where subject_id = '95000000-0000-4000-8000-000000000002'
  ),
  1,
  'atomic start creates only one background job'
);

set local role authenticated;
select is(
  (
    public.queue_workflow_retry(
      (
        select id
        from public.workflow_runs
        where comparison_id = '95000000-0000-4000-8000-000000000002'
      ),
      'pgtap-retry-coalesce'
    ) ->> 'created'
  ),
  'false',
  'manual retry coalesces with an already runnable job'
);
reset role;

update public.background_jobs
set status = 'completed',
    completed_at = clock_timestamp(),
    lease_owner = null,
    lease_expires_at = null
where subject_id = '95000000-0000-4000-8000-000000000002';

update public.workflow_runs
set status = 'failed'
where comparison_id = '95000000-0000-4000-8000-000000000002';

set local role authenticated;
select is(
  (
    public.queue_workflow_retry(
      (
        select id
        from public.workflow_runs
        where comparison_id = '95000000-0000-4000-8000-000000000002'
      ),
      'pgtap-retry-1'
    ) ->> 'created'
  ),
  'true',
  'first manual retry creates a persisted retry generation'
);
select is(
  (
    public.queue_workflow_retry(
      (
        select id
        from public.workflow_runs
        where comparison_id = '95000000-0000-4000-8000-000000000002'
      ),
      'pgtap-retry-2'
    ) ->> 'created'
  ),
  'false',
  'concurrent-equivalent retry request reuses the queued generation'
);
reset role;

select is(
  (
    select manual_retry_count
    from public.workflow_runs
    where comparison_id = '95000000-0000-4000-8000-000000000002'
  ),
  1,
  'manual retry generation increments exactly once'
);
select is(
  (
    select count(*)::integer
    from public.background_jobs
    where subject_id = '95000000-0000-4000-8000-000000000002'
  ),
  2,
  'one later retry generation adds exactly one job'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where actor_user_id = '93000000-0000-4000-8000-000000000006'
      and action = 'membership.accepted'
  ),
  'controlled invitation RPC writes its audit event'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where actor_user_id = '93000000-0000-4000-8000-000000000002'
      and action = 'comparison.started'
  ),
  'controlled workflow-start RPC writes its audit event'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where actor_user_id = '93000000-0000-4000-8000-000000000002'
      and action = 'workflow.retry_queued'
  ),
  'controlled retry RPC writes its audit event'
);
select is(
  (
    select count(distinct suite_version)::integer
    from public.evaluation_questions
    where organization_id = '91000000-0000-4000-8000-000000000001'
  ),
  1,
  'tenant-local evaluation rows record a single explicit suite version'
);

select * from finish();
rollback;
