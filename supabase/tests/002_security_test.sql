begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

select ok(
  not has_table_privilege('anon', 'public.documents', 'SELECT'),
  'anonymous users cannot select documents'
);
select ok(
  not has_table_privilege('anon', 'public.audit_logs', 'SELECT'),
  'anonymous users cannot select audit logs'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_logs', 'INSERT'),
  'authenticated users cannot insert audit rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.approval_decisions', 'INSERT'),
  'authenticated users cannot append approval decisions directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.workflow_checkpoints', 'INSERT'),
  'authenticated users checkpoint through the transactional RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.rate_limit_buckets', 'SELECT'),
  'rate-limit counters are not client-readable'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_background_jobs(uuid,integer,integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot claim background jobs'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.check_rate_limit(text,integer,integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot manufacture rate-limit buckets'
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
  'trusted service mutations retain audit append access'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'rate_limit_buckets'
  ),
  0,
  'rate-limit table deliberately has no browser policy'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'policy_documents_%'
  ),
  4,
  'private bucket has read, insert, update, and delete policies'
);

select ok(
  public.check_rate_limit('pgtap:fixed-bucket', 2, 60),
  'first request is within the fixed-window limit'
);
select ok(
  public.check_rate_limit('pgtap:fixed-bucket', 2, 60)
  and not public.check_rate_limit('pgtap:fixed-bucket', 2, 60),
  'counter permits the limit and rejects the next request atomically'
);

select * from finish();
rollback;
