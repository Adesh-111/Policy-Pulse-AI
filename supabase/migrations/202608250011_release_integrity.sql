-- Final release invariants: bind report objects to their exact comparison,
-- prevent terminal comparisons from being restarted, and keep evaluation
-- corpus identities immutable once results reference them.

alter table public.reports
  drop constraint if exists reports_storage_path_scope_check;
alter table public.reports
  add constraint reports_storage_path_scope_check check (
    (
      storage_path is null
      and storage_bucket is null
    )
    or (
      storage_bucket = 'policy-documents'
      and storage_path like
        organization_id::text || '/reports/' || comparison_id::text || '/%'
      and storage_path !~ '(^|/)\.\.(/|$)'
      and storage_path !~ '^/'
    )
  );

create or replace function private.prevent_terminal_comparison_workflow_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.comparison_status;
begin
  if new.comparison_id is null then
    return new;
  end if;
  select status into v_status
  from public.policy_comparisons
  where id = new.comparison_id
    and organization_id = new.organization_id
  for update;
  if v_status in ('approved', 'rejected', 'completed', 'cancelled') then
    raise exception 'A terminal comparison cannot start another workflow run'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_terminal_comparison_workflow_start()
  from public, anon, authenticated;

drop trigger if exists workflow_runs_prevent_terminal_restart
  on public.workflow_runs;
create trigger workflow_runs_prevent_terminal_restart
  before insert on public.workflow_runs
  for each row execute function private.prevent_terminal_comparison_workflow_start();

-- Evaluation questions are installation-owned corpus material, not editable
-- tenant content. New suites create new rows, while result foreign keys retain
-- the exact question identity used for a historical observation.
drop policy if exists evaluation_questions_manager_insert
  on public.evaluation_questions;
drop policy if exists evaluation_questions_manager_update
  on public.evaluation_questions;
drop policy if exists evaluation_questions_manager_delete
  on public.evaluation_questions;

alter table public.evaluation_results
  drop constraint if exists evaluation_results_question_tenant_fk;
alter table public.evaluation_results
  add constraint evaluation_results_question_tenant_fk
  foreign key (evaluation_question_id, organization_id)
  references public.evaluation_questions (id, organization_id) on delete restrict;

create or replace function private.protect_evaluation_question_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question_id uuid;
  v_organization_id uuid;
begin
  if tg_op = 'DELETE' then
    v_question_id := old.id;
    v_organization_id := old.organization_id;
  else
    v_question_id := new.id;
    v_organization_id := new.organization_id;
  end if;
  if not exists (
    select 1
    from public.evaluation_results result
    where result.evaluation_question_id = v_question_id
      and result.organization_id = v_organization_id
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'An evaluated question cannot be deleted'
      using errcode = '55000';
  end if;
  if new.organization_id is distinct from old.organization_id
     or new.external_id is distinct from old.external_id
     or new.suite_version is distinct from old.suite_version
     or new.question is distinct from old.question
     or new.expected_answer is distinct from old.expected_answer
     or new.category is distinct from old.category
     or new.expected_sources is distinct from old.expected_sources
     or new.expected_change_types is distinct from old.expected_change_types
     or new.expected_risk is distinct from old.expected_risk
     or new.difficulty is distinct from old.difficulty
     or new.tags is distinct from old.tags then
    raise exception 'An evaluated question identity is immutable; publish a new suite version'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_evaluation_question_history()
  from public, anon, authenticated;

drop trigger if exists evaluation_questions_protect_history
  on public.evaluation_questions;
create trigger evaluation_questions_protect_history
  before update or delete on public.evaluation_questions
  for each row execute function private.protect_evaluation_question_history();

-- Serialize active-suite changes for one organization. The transaction-level
-- advisory lock also covers direct service-role provisioning calls that do not
-- already hold an organization row lock.
create or replace function private.enforce_single_active_evaluation_suite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active then
    perform pg_advisory_xact_lock(
      hashtextextended(new.organization_id::text, 740711)
    );
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

comment on constraint reports_storage_path_scope_check on public.reports is
  'A stored report artifact must be under its own organization and comparison prefix.';
