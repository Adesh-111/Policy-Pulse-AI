begin;

create extension if not exists pgtap with schema extensions;
select plan(55);

select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'departments', 'departments table exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'memberships', 'memberships table exists');
select has_table('public', 'profile_departments', 'profile department grants exist');
select has_table('public', 'documents', 'documents table exists');
select has_table('public', 'document_departments', 'document department grants exist');
select has_table('public', 'document_chunks', 'document chunks table exists');
select has_table('public', 'policy_comparisons', 'policy comparisons table exists');
select has_table('public', 'policy_changes', 'policy changes table exists');
select has_table('public', 'policy_conflicts', 'policy conflicts table exists');
select has_table('public', 'risk_assessments', 'risk assessments table exists');
select has_table('public', 'action_plans', 'action plans table exists');
select has_table('public', 'action_items', 'action items table exists');
select has_table('public', 'workflow_runs', 'workflow runs table exists');
select has_table('public', 'workflow_checkpoints', 'workflow checkpoints table exists');
select has_table('public', 'background_jobs', 'background jobs table exists');
select has_table('public', 'approval_requests', 'approval requests table exists');
select has_table('public', 'approval_decisions', 'approval decisions table exists');
select has_table('public', 'chat_sessions', 'chat sessions table exists');
select has_table('public', 'chat_messages', 'chat messages table exists');
select has_table('public', 'evaluation_questions', 'evaluation questions table exists');
select has_table('public', 'evaluation_results', 'evaluation results table exists');
select has_table('public', 'audit_logs', 'audit logs table exists');
select has_table('public', 'ai_usage_logs', 'AI usage logs table exists');
select has_table('public', 'reports', 'reports table exists');
select has_table('public', 'settings', 'settings table exists');
select has_table('public', 'rate_limit_buckets', 'rate-limit buckets table exists');

select has_extension('vector', 'pgvector extension is installed');

select ok(
  exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'document_chunks'
      and a.attname = 'embedding'
      and format_type(a.atttypid, a.atttypmod) like '%vector(1536)'
  ),
  'document embeddings have 1536 dimensions'
);

select ok(
  exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'document_chunks'
      and a.attname = 'search_vector'
      and a.attgenerated = 's'
  ),
  'full-text vector is a stored generated column'
);

select has_index(
  'public', 'document_chunks', 'document_chunks_embedding_hnsw_idx',
  'document chunks have an HNSW vector index'
);
select has_index(
  'public', 'document_chunks', 'document_chunks_fts_idx',
  'document chunks have a GIN full-text index'
);

select ok(
  to_regprocedure('public.hybrid_search_document_chunks(text,extensions.vector,integer,real,real,integer,uuid,uuid[],uuid[],text[],real)') is not null,
  'hybrid retrieval RPC exists'
);
select ok(
  to_regprocedure('public.create_document_record(uuid,uuid,text,text,text,text,public.document_designation,date,text,text,text,bigint,text,text,uuid,uuid[],jsonb)') is not null,
  'transactional document RPC exists'
);
select ok(
  to_regprocedure('public.record_approval_decision(uuid,public.approval_decision_type,text,integer)') is not null,
  'optimistic approval RPC exists'
);
select ok(
  to_regprocedure('public.claim_background_jobs(uuid,integer,integer)') is not null,
  'durable job claim RPC exists'
);
select ok(
  to_regprocedure('public.save_workflow_checkpoint(uuid,text,text,jsonb,text,text,jsonb,jsonb,jsonb,jsonb,jsonb)') is not null,
  'workflow checkpoint RPC exists'
);
select ok(
  to_regprocedure('public.check_rate_limit(text,integer,integer)') is not null,
  'atomic rate-limit RPC exists'
);
select has_column(
  'public', 'workflow_runs', 'manual_retry_count',
  'workflow runs persist stable manual retry generations'
);
select has_column(
  'public', 'evaluation_questions', 'suite_version',
  'tenant-local evaluation questions record their suite version'
);
select has_index(
  'public', 'workflow_runs', 'workflow_runs_one_active_per_comparison',
  'one-active-workflow invariant has a database index'
);
select ok(
  to_regprocedure('public.accept_current_user_invitation(uuid)') is not null,
  'secure invitation acceptance RPC exists'
);
select ok(
  to_regprocedure('public.start_policy_comparison_workflow(uuid,text)') is not null,
  'atomic workflow-start RPC exists'
);
select ok(
  to_regprocedure('public.queue_workflow_retry(uuid,text)') is not null,
  'serialized workflow-retry RPC exists'
);
select has_column(
  'public', 'evaluation_results', 'run_id',
  'evaluation observations retain a stable run identifier'
);
select has_column(
  'public', 'evaluation_results', 'dataset_version',
  'evaluation observations retain their dataset version'
);
select has_column(
  'public', 'evaluation_results', 'total_tokens',
  'evaluation observations expose generated total token counts'
);
select ok(
  to_regprocedure('public.update_membership_access(uuid,uuid,public.app_role,public.membership_status,uuid[])') is not null,
  'membership access updates use a transactional RPC'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'reports_storage_path_scope_check'
      and pg_get_constraintdef(oid) ilike '%comparison_id%'
  ),
  'stored report paths are scoped to their exact comparison'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'workflow_runs_prevent_terminal_restart'
      and not tgisinternal
  ),
  'terminal comparisons cannot create another workflow run'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'evaluation_results_question_tenant_fk'
      and confdeltype = 'r'
  ),
  'evaluation result questions use restrictive deletion'
);
select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'evaluation_questions'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  ),
  'authenticated tenants cannot mutate the installed evaluation corpus'
);

select is(
  (select public from storage.buckets where id = 'policy-documents'),
  false,
  'policy document Storage bucket is private'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname = any (array[
        'organizations', 'departments', 'profiles', 'memberships',
        'profile_departments', 'documents', 'document_departments', 'document_chunks',
        'policy_comparisons', 'policy_changes', 'policy_conflicts', 'risk_assessments',
        'action_plans', 'action_items', 'workflow_runs', 'workflow_checkpoints',
        'background_jobs', 'approval_requests', 'approval_decisions', 'chat_sessions',
        'chat_messages', 'evaluation_questions', 'evaluation_results', 'audit_logs',
        'ai_usage_logs', 'reports', 'settings', 'rate_limit_buckets'
      ])
      and not c.relrowsecurity
  ),
  'RLS is enabled on every application table'
);

select * from finish();
rollback;
