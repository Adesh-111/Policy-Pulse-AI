-- PolicyPulse AI multi-tenant application schema.
-- Organization ids are repeated on child records deliberately: composite foreign
-- keys prevent a record from ever pointing across tenant boundaries.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, slug)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  default_organization_id uuid references public.organizations (id) on delete set null,
  department_id uuid,
  full_name text not null default '' check (char_length(full_name) <= 160),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_department_requires_organization
    check (department_id is null or default_organization_id is not null),
  constraint profiles_department_tenant_fk
    foreign key (department_id, default_organization_id)
    references public.departments (id, organization_id) on delete set null (department_id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null default 'department_user',
  department_id uuid,
  status public.membership_status not null default 'invited',
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, organization_id),
  constraint memberships_department_tenant_fk
    foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete set null (department_id),
  constraint memberships_department_role_check
    check (role <> 'department_user' or department_id is not null or status = 'invited')
);

create table public.profile_departments (
  user_id uuid not null references auth.users (id) on delete cascade,
  department_id uuid not null,
  organization_id uuid not null,
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, department_id),
  constraint profile_departments_membership_fk
    foreign key (organization_id, user_id)
    references public.memberships (organization_id, user_id) on delete cascade,
  constraint profile_departments_department_tenant_fk
    foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete cascade
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  department_id uuid,
  uploaded_by uuid references auth.users (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  description text not null default '' check (char_length(description) <= 4000),
  category text not null check (char_length(btrim(category)) between 2 and 80),
  version text not null check (char_length(btrim(version)) between 1 and 40),
  designation public.document_designation not null,
  effective_date date,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  )),
  file_extension text not null check (file_extension in ('pdf', 'docx', 'txt', 'md', 'markdown')),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 20971520),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  storage_bucket text not null default 'policy-documents' check (storage_bucket = 'policy-documents'),
  storage_path text not null check (
    char_length(storage_path) between 3 and 1024
    and storage_path !~ '(^|/)\.\.(/|$)'
    and storage_path !~ '^/'
  ),
  processing_status public.document_processing_status not null default 'uploaded',
  processing_error text,
  page_count integer check (page_count is null or page_count > 0),
  word_count integer check (word_count is null or word_count >= 0),
  indexed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  unique (id, organization_id),
  constraint documents_storage_path_scope_check check (
    storage_path like organization_id::text || '/' || id::text || '/%'
  ),
  constraint documents_department_tenant_fk
    foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete set null (department_id),
  constraint documents_processing_error_check check (
    (processing_status = 'failed' and processing_error is not null)
    or (processing_status <> 'failed' and processing_error is null)
  ),
  constraint documents_indexed_at_check check (
    processing_status <> 'indexed' or indexed_at is not null
  )
);

create unique index documents_tenant_checksum_unique
  on public.documents (organization_id, content_sha256)
  where content_sha256 is not null;

create table public.document_departments (
  document_id uuid not null,
  department_id uuid not null,
  organization_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (document_id, department_id),
  constraint document_departments_document_tenant_fk
    foreign key (document_id, organization_id)
    references public.documents (id, organization_id) on delete cascade,
  constraint document_departments_department_tenant_fk
    foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete cascade
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  department_id uuid,
  document_version text not null,
  category text not null,
  effective_date date,
  storage_path text not null,
  page_number integer check (page_number is null or page_number > 0),
  section_heading text check (section_heading is null or char_length(section_heading) <= 500),
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(btrim(content)) > 0),
  token_count integer check (token_count is null or token_count > 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  embedding extensions.vector(1536),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(section_heading, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, content), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, chunk_index),
  unique (id, organization_id),
  constraint document_chunks_document_tenant_fk
    foreign key (document_id, organization_id)
    references public.documents (id, organization_id) on delete cascade,
  constraint document_chunks_department_tenant_fk
    foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete set null (department_id)
);

create table public.policy_comparisons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  old_document_id uuid not null,
  new_document_id uuid not null,
  requested_by uuid references auth.users (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  status public.comparison_status not null default 'draft',
  analysis_version integer not null default 1 check (analysis_version > 0),
  executive_summary text,
  overall_risk public.risk_level,
  overall_confidence numeric(5,4) check (overall_confidence between 0 and 1),
  quality_score numeric(5,4) check (quality_score between 0 and 1),
  revision_count integer not null default 0 check (revision_count between 0 and 2),
  started_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint policy_comparisons_distinct_documents check (old_document_id <> new_document_id),
  constraint policy_comparisons_old_document_tenant_fk
    foreign key (old_document_id, organization_id)
    references public.documents (id, organization_id) on delete restrict,
  constraint policy_comparisons_new_document_tenant_fk
    foreign key (new_document_id, organization_id)
    references public.documents (id, organization_id) on delete restrict
);

create table public.policy_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  comparison_id uuid not null,
  department_id uuid,
  old_chunk_id uuid,
  new_chunk_id uuid,
  change_type public.change_type not null,
  old_text text,
  new_text text,
  explanation text not null check (char_length(btrim(explanation)) > 0),
  impact text not null check (char_length(btrim(impact)) > 0),
  risk_level public.risk_level not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  old_citation jsonb check (old_citation is null or jsonb_typeof(old_citation) = 'object'),
  new_citation jsonb check (new_citation is null or jsonb_typeof(new_citation) = 'object'),
  status public.finding_status not null default 'open',
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint policy_changes_comparison_tenant_fk
    foreign key (comparison_id, organization_id)
    references public.policy_comparisons (id, organization_id) on delete cascade,
  constraint policy_changes_department_tenant_fk
    foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete set null (department_id),
  constraint policy_changes_old_chunk_tenant_fk
    foreign key (old_chunk_id, organization_id)
    references public.document_chunks (id, organization_id) on delete set null (old_chunk_id),
  constraint policy_changes_new_chunk_tenant_fk
    foreign key (new_chunk_id, organization_id)
    references public.document_chunks (id, organization_id) on delete set null (new_chunk_id),
  constraint policy_changes_evidence_check check (
    (change_type in ('added', 'exception_added', 'compliance_requirement') and new_text is not null)
    or (change_type in ('removed', 'exception_removed') and old_text is not null)
    or (change_type not in ('added', 'exception_added', 'compliance_requirement', 'removed', 'exception_removed')
        and (old_text is not null or new_text is not null))
  )
);

create table public.policy_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  comparison_id uuid not null,
  department_id uuid,
  left_document_id uuid not null,
  right_document_id uuid not null,
  conflict_type text not null check (char_length(btrim(conflict_type)) between 2 and 80),
  left_text text not null check (char_length(btrim(left_text)) > 0),
  right_text text not null check (char_length(btrim(right_text)) > 0),
  explanation text not null check (char_length(btrim(explanation)) > 0),
  risk_level public.risk_level not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  left_citation jsonb not null check (jsonb_typeof(left_citation) = 'object'),
  right_citation jsonb not null check (jsonb_typeof(right_citation) = 'object'),
  status public.finding_status not null default 'open',
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint policy_conflicts_distinct_documents check (left_document_id <> right_document_id),
  constraint policy_conflicts_comparison_tenant_fk
    foreign key (comparison_id, organization_id)
    references public.policy_comparisons (id, organization_id) on delete cascade,
  constraint policy_conflicts_department_tenant_fk
    foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete set null (department_id),
  constraint policy_conflicts_left_document_tenant_fk
    foreign key (left_document_id, organization_id)
    references public.documents (id, organization_id) on delete restrict,
  constraint policy_conflicts_right_document_tenant_fk
    foreign key (right_document_id, organization_id)
    references public.documents (id, organization_id) on delete restrict
);

create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  comparison_id uuid not null,
  policy_change_id uuid,
  policy_conflict_id uuid,
  department_id uuid,
  dimension text not null check (char_length(btrim(dimension)) between 2 and 80),
  risk_level public.risk_level not null,
  score numeric(5,2) not null check (score between 0 and 100),
  likelihood numeric(5,2) check (likelihood between 0 and 100),
  impact_score numeric(5,2) check (impact_score between 0 and 100),
  rationale text not null check (char_length(btrim(rationale)) > 0),
  mitigation text,
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint risk_assessments_single_finding check (num_nonnulls(policy_change_id, policy_conflict_id) <= 1),
  constraint risk_assessments_comparison_tenant_fk
    foreign key (comparison_id, organization_id)
    references public.policy_comparisons (id, organization_id) on delete cascade,
  constraint risk_assessments_change_tenant_fk
    foreign key (policy_change_id, organization_id)
    references public.policy_changes (id, organization_id) on delete cascade,
  constraint risk_assessments_conflict_tenant_fk
    foreign key (policy_conflict_id, organization_id)
    references public.policy_conflicts (id, organization_id) on delete cascade,
  constraint risk_assessments_department_tenant_fk
    foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete set null (department_id)
);

create table public.action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  comparison_id uuid not null,
  department_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  summary text not null check (char_length(btrim(summary)) > 0),
  owner_user_id uuid references auth.users (id) on delete set null,
  status public.action_status not null default 'not_started',
  priority public.risk_level not null,
  due_date date,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (comparison_id, department_id),
  constraint action_plans_comparison_tenant_fk
    foreign key (comparison_id, organization_id)
    references public.policy_comparisons (id, organization_id) on delete cascade,
  constraint action_plans_department_tenant_fk
    foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete restrict,
  constraint action_plans_approval_check check (
    (approved_by is null and approved_at is null) or
    (approved_by is not null and approved_at is not null)
  )
);

create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  action_plan_id uuid not null,
  assignee_user_id uuid references auth.users (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  description text not null default '',
  sequence_number integer not null check (sequence_number > 0),
  status public.action_status not null default 'not_started',
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  due_date date,
  completion_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_plan_id, sequence_number),
  unique (id, organization_id),
  constraint action_items_plan_tenant_fk
    foreign key (action_plan_id, organization_id)
    references public.action_plans (id, organization_id) on delete cascade,
  constraint action_items_completion_check check (
    (status = 'completed' and progress_percent = 100 and completed_at is not null)
    or (status <> 'completed' and progress_percent < 100 and completed_at is null)
  )
);

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  comparison_id uuid,
  thread_id text not null check (char_length(btrim(thread_id)) between 1 and 200),
  status public.workflow_status not null default 'pending',
  current_node text,
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  output jsonb check (output is null or jsonb_typeof(output) = 'object'),
  retry_count integer not null default 0 check (retry_count >= 0),
  max_retries integer not null default 3 check (max_retries between 0 and 10),
  next_retry_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  last_error jsonb check (last_error is null or jsonb_typeof(last_error) = 'object'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, thread_id),
  unique (id, organization_id),
  constraint workflow_runs_comparison_tenant_fk
    foreign key (comparison_id, organization_id)
    references public.policy_comparisons (id, organization_id) on delete cascade,
  constraint workflow_runs_lease_check check (
    (lease_owner is null and lease_expires_at is null)
    or (lease_owner is not null and lease_expires_at is not null)
  )
);

create table public.workflow_checkpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_run_id uuid not null,
  checkpoint_namespace text not null default '',
  checkpoint_id text not null check (char_length(btrim(checkpoint_id)) between 1 and 240),
  parent_checkpoint_id text,
  node_name text not null check (char_length(btrim(node_name)) between 1 and 120),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  channel_values jsonb not null default '{}'::jsonb check (jsonb_typeof(channel_values) = 'object'),
  channel_versions jsonb not null default '{}'::jsonb check (jsonb_typeof(channel_versions) = 'object'),
  versions_seen jsonb not null default '{}'::jsonb check (jsonb_typeof(versions_seen) = 'object'),
  pending_sends jsonb not null default '[]'::jsonb check (jsonb_typeof(pending_sends) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  sequence_number bigint generated always as identity,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workflow_run_id, checkpoint_namespace, checkpoint_id),
  unique (id, organization_id),
  constraint workflow_checkpoints_run_tenant_fk
    foreign key (workflow_run_id, organization_id)
    references public.workflow_runs (id, organization_id) on delete cascade
);

alter table public.workflow_runs
  add column current_checkpoint_id uuid references public.workflow_checkpoints (id) on delete set null;

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  workflow_run_id uuid,
  job_type text not null check (char_length(btrim(job_type)) between 1 and 120),
  subject_type text not null check (subject_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  subject_id text not null check (char_length(btrim(subject_id)) between 1 and 240),
  node_name text check (node_name is null or char_length(btrim(node_name)) between 1 and 120),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 8 and 240),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  result jsonb check (result is null or jsonb_typeof(result) in ('object', 'array')),
  status public.job_status not null default 'queued',
  priority smallint not null default 50 check (priority between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  lease_owner uuid,
  lease_expires_at timestamptz,
  last_error jsonb check (last_error is null or jsonb_typeof(last_error) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (id, organization_id),
  constraint background_jobs_run_tenant_fk
    foreign key (workflow_run_id, organization_id)
    references public.workflow_runs (id, organization_id) on delete cascade,
  constraint background_jobs_lease_check check (
    (lease_owner is null and lease_expires_at is null)
    or (lease_owner is not null and lease_expires_at is not null)
  )
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  comparison_id uuid not null,
  workflow_run_id uuid,
  requested_by uuid references auth.users (id) on delete set null,
  assigned_to uuid references auth.users (id) on delete set null,
  status public.approval_status not null default 'pending',
  risk_level public.risk_level,
  reason text not null check (char_length(btrim(reason)) > 0),
  analysis_version integer not null check (analysis_version > 0),
  due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint approval_requests_risk_route_check check (
    risk_level is null or risk_level in ('high', 'critical')
  ),
  constraint approval_requests_resolution_check check (
    (status = 'pending' and resolved_at is null)
    or (status <> 'pending' and resolved_at is not null)
  ),
  constraint approval_requests_comparison_tenant_fk
    foreign key (comparison_id, organization_id)
    references public.policy_comparisons (id, organization_id) on delete cascade,
  constraint approval_requests_run_tenant_fk
    foreign key (workflow_run_id, organization_id)
    references public.workflow_runs (id, organization_id) on delete set null (workflow_run_id)
);

create unique index approval_requests_one_pending_per_version
  on public.approval_requests (comparison_id, analysis_version)
  where status = 'pending';

create table public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  approval_request_id uuid not null,
  reviewer_id uuid not null references auth.users (id) on delete restrict,
  decision public.approval_decision_type not null,
  notes text not null default '',
  previous_status public.approval_status not null,
  new_status public.approval_status not null,
  analysis_version integer not null check (analysis_version > 0),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint approval_decisions_request_tenant_fk
    foreign key (approval_request_id, organization_id)
    references public.approval_requests (id, organization_id) on delete cascade,
  constraint approval_decisions_transition_check check (
    previous_status = 'pending' and
    ((decision = 'approved' and new_status = 'approved') or
     (decision = 'rejected' and new_status = 'rejected') or
     (decision = 'revision_requested' and new_status = 'revision_requested'))
  )
);

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New policy question' check (char_length(title) between 1 and 200),
  department_filter_ids uuid[] not null default '{}'::uuid[],
  document_filter_ids uuid[] not null default '{}'::uuid[],
  is_archived boolean not null default false,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  session_id uuid not null,
  role public.chat_message_role not null,
  content text not null check (char_length(btrim(content)) > 0),
  citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array'),
  tool_events jsonb not null default '[]'::jsonb check (jsonb_typeof(tool_events) = 'array'),
  model text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint chat_messages_session_tenant_fk
    foreign key (session_id, organization_id)
    references public.chat_sessions (id, organization_id) on delete cascade
);

create table public.evaluation_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  external_id text not null check (external_id ~ '^eval-[0-9]{3,}$'),
  question text not null check (char_length(btrim(question)) > 0),
  expected_answer text not null check (char_length(btrim(expected_answer)) > 0),
  category text not null check (char_length(btrim(category)) between 2 and 80),
  expected_sources jsonb not null default '[]'::jsonb check (jsonb_typeof(expected_sources) = 'array'),
  expected_change_types public.change_type[] not null default '{}'::public.change_type[],
  expected_risk public.risk_level,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  tags text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_id),
  unique (id, organization_id)
);

create table public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  evaluation_question_id uuid not null,
  comparison_id uuid,
  variant public.evaluation_variant not null,
  run_label text not null check (char_length(btrim(run_label)) between 1 and 120),
  answer text not null,
  citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array'),
  retrieval_precision numeric(6,5) check (retrieval_precision between 0 and 1),
  retrieval_recall numeric(6,5) check (retrieval_recall between 0 and 1),
  context_relevance numeric(6,5) check (context_relevance between 0 and 1),
  answer_relevance numeric(6,5) check (answer_relevance between 0 and 1),
  faithfulness numeric(6,5) check (faithfulness between 0 and 1),
  citation_correctness numeric(6,5) check (citation_correctness between 0 and 1),
  change_detection_accuracy numeric(6,5) check (change_detection_accuracy between 0 and 1),
  conflict_detection_accuracy numeric(6,5) check (conflict_detection_accuracy between 0 and 1),
  unsupported_claim_rate numeric(6,5) check (unsupported_claim_rate between 0 and 1),
  latency_ms integer not null check (latency_ms >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  evaluator_notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint evaluation_results_question_tenant_fk
    foreign key (evaluation_question_id, organization_id)
    references public.evaluation_questions (id, organization_id) on delete cascade,
  constraint evaluation_results_comparison_tenant_fk
    foreign key (comparison_id, organization_id)
    references public.policy_comparisons (id, organization_id) on delete set null (comparison_id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action ~ '^[a-z][a-z0-9_.-]{1,119}$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  entity_id text,
  old_values jsonb check (old_values is null or jsonb_typeof(old_values) = 'object'),
  new_values jsonb check (new_values is null or jsonb_typeof(new_values) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  request_id text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.ai_usage_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid references auth.users (id) on delete set null,
  workflow_run_id uuid,
  request_id text,
  model text not null check (char_length(btrim(model)) between 1 and 120),
  operation text not null check (char_length(btrim(operation)) between 1 and 120),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer generated always as (input_tokens + output_tokens) stored,
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  status public.operation_status not null,
  error_type text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint ai_usage_logs_run_tenant_fk
    foreign key (workflow_run_id, organization_id)
    references public.workflow_runs (id, organization_id) on delete set null (workflow_run_id),
  constraint ai_usage_logs_error_check check (
    status <> 'failed' or error_type is not null
  )
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  comparison_id uuid not null,
  generated_by uuid references auth.users (id) on delete set null,
  format public.report_format not null,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  content text,
  storage_bucket text check (storage_bucket is null or storage_bucket = 'policy-documents'),
  storage_path text,
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
  generation_version integer not null default 1 check (generation_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint reports_comparison_tenant_fk
    foreign key (comparison_id, organization_id)
    references public.policy_comparisons (id, organization_id) on delete cascade,
  constraint reports_content_location_check check (
    content is not null or (storage_bucket is not null and storage_path is not null)
  )
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_.-]{1,119}$'),
  value jsonb not null,
  description text,
  is_client_visible boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key),
  unique (id, organization_id)
);

create table public.rate_limit_buckets (
  bucket_key text not null check (bucket_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (bucket_key, window_started_at),
  constraint rate_limit_buckets_expiry_check check (expires_at > window_started_at)
);

-- Relational and operational indexes. Foreign key columns are indexed explicitly
-- because PostgreSQL does not create indexes for referencing columns.
create index memberships_user_active_idx
  on public.memberships (user_id, organization_id, role)
  where status = 'active';
create index memberships_department_idx on public.memberships (department_id) where department_id is not null;
create index profile_departments_department_idx on public.profile_departments (department_id, user_id);
create index departments_org_active_idx on public.departments (organization_id, name) where is_active;

create index documents_org_created_idx on public.documents (organization_id, created_at desc);
create index documents_org_department_idx on public.documents (organization_id, department_id);
create index documents_org_status_idx on public.documents (organization_id, processing_status);
create index documents_org_category_version_idx on public.documents (organization_id, category, version);
create index documents_effective_date_idx on public.documents (organization_id, effective_date desc);
create index document_departments_department_idx on public.document_departments (department_id, document_id);

create index document_chunks_document_sequence_idx on public.document_chunks (document_id, chunk_index);
create index document_chunks_org_department_idx on public.document_chunks (organization_id, department_id);
create index document_chunks_metadata_idx on public.document_chunks using gin (metadata jsonb_path_ops);
create index document_chunks_fts_idx on public.document_chunks using gin (search_vector);
create index document_chunks_embedding_hnsw_idx
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index policy_comparisons_org_status_idx on public.policy_comparisons (organization_id, status, created_at desc);
create index policy_comparisons_old_document_idx on public.policy_comparisons (old_document_id);
create index policy_comparisons_new_document_idx on public.policy_comparisons (new_document_id);
create index policy_changes_comparison_risk_idx on public.policy_changes (comparison_id, risk_level);
create index policy_changes_department_idx on public.policy_changes (department_id) where department_id is not null;
create index policy_conflicts_comparison_risk_idx on public.policy_conflicts (comparison_id, risk_level);
create index policy_conflicts_department_idx on public.policy_conflicts (department_id) where department_id is not null;
create index risk_assessments_comparison_idx on public.risk_assessments (comparison_id, risk_level);
create index risk_assessments_department_idx on public.risk_assessments (department_id) where department_id is not null;
create index action_plans_department_status_idx on public.action_plans (organization_id, department_id, status);
create index action_items_assignee_status_idx on public.action_items (assignee_user_id, status) where assignee_user_id is not null;

create index workflow_runs_runnable_idx on public.workflow_runs (status, next_retry_at, created_at)
  where status in ('pending', 'retry_scheduled');
create index workflow_runs_comparison_idx on public.workflow_runs (comparison_id) where comparison_id is not null;
create index workflow_checkpoints_run_sequence_idx on public.workflow_checkpoints (workflow_run_id, sequence_number desc);
create index background_jobs_claim_idx on public.background_jobs (priority desc, next_attempt_at, created_at)
  where status in ('queued', 'retry_scheduled');
create index background_jobs_lease_idx on public.background_jobs (lease_expires_at)
  where status = 'running';

create index approval_requests_queue_idx on public.approval_requests (organization_id, status, risk_level, created_at);
create index approval_requests_assignee_idx on public.approval_requests (assigned_to, status) where assigned_to is not null;
create index approval_decisions_request_idx on public.approval_decisions (approval_request_id, created_at);
create index chat_sessions_user_recent_idx on public.chat_sessions (user_id, last_message_at desc nulls last);
create index chat_messages_session_time_idx on public.chat_messages (session_id, created_at);
create index evaluation_results_question_variant_idx on public.evaluation_results (evaluation_question_id, variant, created_at desc);
create index audit_logs_org_time_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (organization_id, entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc) where actor_user_id is not null;
create index ai_usage_logs_org_time_idx on public.ai_usage_logs (organization_id, created_at desc);
create index ai_usage_logs_workflow_idx on public.ai_usage_logs (workflow_run_id) where workflow_run_id is not null;
create index reports_comparison_idx on public.reports (comparison_id, created_at desc);
create index rate_limit_buckets_expiry_idx on public.rate_limit_buckets (expires_at);

comment on table public.memberships is 'Authoritative organization role and department assignment. Never trust client-supplied role metadata.';
comment on column public.document_chunks.embedding is 'OpenAI text-embedding-3-small vector; exactly 1536 dimensions.';
comment on table public.workflow_checkpoints is 'Durable LangGraph-compatible state. Important workflow state must not live only in process memory.';
comment on table public.audit_logs is 'Append-only security and business audit trail; direct client mutation is revoked by later migrations.';
comment on table public.settings is 'Non-secret organization configuration only. API keys and credentials must remain in server environment variables.';
comment on table public.rate_limit_buckets is 'Server-managed fixed-window counters. Keys are SHA-256 digests; clients have no direct table access.';
