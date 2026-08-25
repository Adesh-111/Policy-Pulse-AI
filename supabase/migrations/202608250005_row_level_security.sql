-- Row Level Security matrix:
--   administrator  manage tenant data and users; read audit/usage/settings
--   policy_manager manage policy/workflow content and approvals
--   department_user read authorized evidence/actions and update action progress
--   auditor        read comparisons/evidence/approvals/audit; never mutate findings

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'organizations', 'departments', 'profiles', 'memberships',
    'profile_departments', 'documents', 'document_departments', 'document_chunks',
    'policy_comparisons', 'policy_changes', 'policy_conflicts', 'risk_assessments',
    'action_plans', 'action_items', 'workflow_runs', 'workflow_checkpoints',
    'background_jobs', 'approval_requests', 'approval_decisions', 'chat_sessions',
    'chat_messages', 'evaluation_questions', 'evaluation_results', 'audit_logs',
    'ai_usage_logs', 'reports', 'settings', 'rate_limit_buckets'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
  end loop;
end;
$$;

-- Remove Supabase's broad default grants and add only operations that are also
-- covered by a policy below. No anonymous role receives direct table access.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on table
  public.organizations, public.departments, public.profiles, public.memberships,
  public.profile_departments, public.documents, public.document_departments,
  public.document_chunks, public.policy_comparisons, public.policy_changes,
  public.policy_conflicts, public.risk_assessments, public.action_plans,
  public.action_items, public.workflow_runs, public.workflow_checkpoints,
  public.background_jobs, public.approval_requests, public.approval_decisions,
  public.chat_sessions, public.chat_messages, public.evaluation_questions,
  public.evaluation_results, public.audit_logs, public.ai_usage_logs,
  public.reports, public.settings
to authenticated;

grant insert, update, delete on table
  public.departments, public.profiles, public.memberships, public.profile_departments,
  public.documents, public.document_departments, public.document_chunks,
  public.policy_comparisons, public.policy_changes, public.policy_conflicts,
  public.risk_assessments, public.action_plans, public.action_items,
  public.workflow_runs, public.background_jobs, public.approval_requests,
  public.chat_sessions, public.chat_messages, public.evaluation_questions,
  public.evaluation_results, public.reports, public.settings
to authenticated;

grant update on table public.organizations to authenticated;

-- These writes must cross a transactional or trusted-worker boundary. A policy
-- manager's browser session may read them where authorized but cannot bypass
-- upload validation, forge retrieval evidence, or enqueue arbitrary job types.
revoke insert on table public.documents from authenticated;
revoke insert, update, delete on table
  public.document_departments,
  public.document_chunks,
  public.background_jobs
from authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

grant usage on type
  public.app_role, public.membership_status, public.document_designation,
  public.document_processing_status, public.comparison_status, public.change_type,
  public.risk_level, public.finding_status, public.action_status,
  public.workflow_status, public.job_status, public.approval_status,
  public.approval_decision_type, public.chat_message_role,
  public.evaluation_variant, public.operation_status, public.report_format
to authenticated, service_role;

create policy organizations_member_select
on public.organizations for select to authenticated
using (public.is_org_member(id));

create policy organizations_admin_update
on public.organizations for update to authenticated
using (public.has_org_role(id, array['administrator'::public.app_role]))
with check (public.has_org_role(id, array['administrator'::public.app_role]));

create policy departments_member_select
on public.departments for select to authenticated
using (public.is_org_member(organization_id));

create policy departments_admin_insert
on public.departments for insert to authenticated
with check (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy departments_admin_update
on public.departments for update to authenticated
using (public.has_org_role(organization_id, array['administrator'::public.app_role]))
with check (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy departments_admin_delete
on public.departments for delete to authenticated
using (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy profiles_shared_org_select
on public.profiles for select to authenticated
using (public.can_view_user(id));

create policy profiles_self_or_admin_update
on public.profiles for update to authenticated
using (id = auth.uid() or public.can_manage_user(id))
with check (id = auth.uid() or public.can_manage_user(id));

create policy memberships_self_or_governance_select
on public.memberships for select to authenticated
using (
  user_id = auth.uid()
  or public.has_org_role(
    organization_id,
    array['administrator'::public.app_role, 'auditor'::public.app_role]
  )
);

create policy memberships_admin_insert
on public.memberships for insert to authenticated
with check (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy memberships_admin_update
on public.memberships for update to authenticated
using (public.has_org_role(organization_id, array['administrator'::public.app_role]))
with check (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy memberships_admin_delete
on public.memberships for delete to authenticated
using (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy profile_departments_self_or_governance_select
on public.profile_departments for select to authenticated
using (
  user_id = auth.uid()
  or public.has_org_role(
    organization_id,
    array['administrator'::public.app_role, 'auditor'::public.app_role]
  )
);

create policy profile_departments_admin_insert
on public.profile_departments for insert to authenticated
with check (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy profile_departments_admin_update
on public.profile_departments for update to authenticated
using (public.has_org_role(organization_id, array['administrator'::public.app_role]))
with check (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy profile_departments_admin_delete
on public.profile_departments for delete to authenticated
using (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy documents_authorized_select
on public.documents for select to authenticated
using (public.can_access_document(id));

create policy documents_manager_insert
on public.documents for insert to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['administrator'::public.app_role, 'policy_manager'::public.app_role]
  )
  and uploaded_by = auth.uid()
);

create policy documents_manager_update
on public.documents for update to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
))
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy documents_manager_delete
on public.documents for delete to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy document_departments_authorized_select
on public.document_departments for select to authenticated
using (public.can_access_document(document_id));

create policy document_departments_manager_insert
on public.document_departments for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy document_departments_manager_delete
on public.document_departments for delete to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy document_chunks_authorized_select
on public.document_chunks for select to authenticated
using (public.can_access_document(document_id));

create policy document_chunks_manager_insert
on public.document_chunks for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy document_chunks_manager_update
on public.document_chunks for update to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
))
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy document_chunks_manager_delete
on public.document_chunks for delete to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy policy_comparisons_authorized_select
on public.policy_comparisons for select to authenticated
using (public.can_view_comparison(id));

create policy policy_comparisons_manager_insert
on public.policy_comparisons for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy policy_comparisons_manager_update
on public.policy_comparisons for update to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
))
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy policy_comparisons_manager_delete
on public.policy_comparisons for delete to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy policy_changes_authorized_select
on public.policy_changes for select to authenticated
using (
  public.can_view_comparison(comparison_id)
  and public.can_access_department(organization_id, department_id)
);

create policy policy_changes_manager_insert
on public.policy_changes for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy policy_changes_manager_update
on public.policy_changes for update to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
))
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy policy_changes_manager_delete
on public.policy_changes for delete to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy policy_conflicts_authorized_select
on public.policy_conflicts for select to authenticated
using (
  public.can_view_comparison(comparison_id)
  and public.can_access_department(organization_id, department_id)
);

create policy policy_conflicts_manager_insert
on public.policy_conflicts for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy policy_conflicts_manager_update
on public.policy_conflicts for update to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
))
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy policy_conflicts_manager_delete
on public.policy_conflicts for delete to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy risk_assessments_authorized_select
on public.risk_assessments for select to authenticated
using (
  public.can_view_comparison(comparison_id)
  and public.can_access_department(organization_id, department_id)
);

create policy risk_assessments_manager_insert
on public.risk_assessments for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy risk_assessments_manager_update
on public.risk_assessments for update to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
))
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy risk_assessments_manager_delete
on public.risk_assessments for delete to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy action_plans_authorized_select
on public.action_plans for select to authenticated
using (
  public.can_view_comparison(comparison_id)
  and public.can_access_department(organization_id, department_id)
);

create policy action_plans_manager_insert
on public.action_plans for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy action_plans_manager_update
on public.action_plans for update to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
))
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy action_plans_manager_delete
on public.action_plans for delete to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy action_items_authorized_select
on public.action_items for select to authenticated
using (exists (
  select 1
  from public.action_plans ap
  where ap.id = action_items.action_plan_id
    and public.can_access_department(ap.organization_id, ap.department_id)
    and public.can_view_comparison(ap.comparison_id)
));

create policy action_items_manager_insert
on public.action_items for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy action_items_progress_update
on public.action_items for update to authenticated
using (
  public.has_org_role(
    organization_id,
    array['administrator'::public.app_role, 'policy_manager'::public.app_role]
  )
  or exists (
    select 1 from public.action_plans ap
    where ap.id = action_items.action_plan_id
      and public.can_access_department(ap.organization_id, ap.department_id)
  )
)
with check (
  public.has_org_role(
    organization_id,
    array['administrator'::public.app_role, 'policy_manager'::public.app_role]
  )
  or exists (
    select 1 from public.action_plans ap
    where ap.id = action_items.action_plan_id
      and public.can_access_department(ap.organization_id, ap.department_id)
  )
);

create policy action_items_manager_delete
on public.action_items for delete to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

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

create policy workflow_runs_manager_insert
on public.workflow_runs for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy workflow_runs_manager_update
on public.workflow_runs for update to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
))
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy workflow_runs_manager_delete
on public.workflow_runs for delete to authenticated
using (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy workflow_checkpoints_governance_select
on public.workflow_checkpoints for select to authenticated
using (public.has_org_role(
  organization_id,
  array[
    'administrator'::public.app_role,
    'policy_manager'::public.app_role,
    'auditor'::public.app_role
  ]
));

create policy background_jobs_governance_select
on public.background_jobs for select to authenticated
using (public.has_org_role(
  organization_id,
  array[
    'administrator'::public.app_role,
    'policy_manager'::public.app_role,
    'auditor'::public.app_role
  ]
));

create policy background_jobs_manager_insert
on public.background_jobs for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy approval_requests_governance_select
on public.approval_requests for select to authenticated
using (public.has_org_role(
  organization_id,
  array[
    'administrator'::public.app_role,
    'policy_manager'::public.app_role,
    'auditor'::public.app_role
  ]
));

create policy approval_requests_manager_insert
on public.approval_requests for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy approval_decisions_governance_select
on public.approval_decisions for select to authenticated
using (public.has_org_role(
  organization_id,
  array[
    'administrator'::public.app_role,
    'policy_manager'::public.app_role,
    'auditor'::public.app_role
  ]
));

create policy chat_sessions_owner_select
on public.chat_sessions for select to authenticated
using (user_id = auth.uid() and public.is_org_member(organization_id));

create policy chat_sessions_owner_insert
on public.chat_sessions for insert to authenticated
with check (user_id = auth.uid() and public.is_org_member(organization_id));

create policy chat_sessions_owner_update
on public.chat_sessions for update to authenticated
using (user_id = auth.uid() and public.is_org_member(organization_id))
with check (user_id = auth.uid() and public.is_org_member(organization_id));

create policy chat_sessions_owner_delete
on public.chat_sessions for delete to authenticated
using (user_id = auth.uid() and public.is_org_member(organization_id));

create policy chat_messages_owner_select
on public.chat_messages for select to authenticated
using (public.owns_chat_session(session_id));

create policy chat_messages_owner_user_insert
on public.chat_messages for insert to authenticated
with check (role = 'user' and public.owns_chat_session(session_id));

create policy evaluation_questions_member_select
on public.evaluation_questions for select to authenticated
using (public.is_org_member(organization_id));

create policy evaluation_questions_manager_insert
on public.evaluation_questions for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy evaluation_questions_manager_update
on public.evaluation_questions for update to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
))
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy evaluation_questions_manager_delete
on public.evaluation_questions for delete to authenticated
using (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy evaluation_results_governance_select
on public.evaluation_results for select to authenticated
using (
  created_by = auth.uid()
  or public.has_org_role(
    organization_id,
    array[
      'administrator'::public.app_role,
      'policy_manager'::public.app_role,
      'auditor'::public.app_role
    ]
  )
);

create policy evaluation_results_manager_insert
on public.evaluation_results for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy evaluation_results_manager_update
on public.evaluation_results for update to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
))
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy evaluation_results_manager_delete
on public.evaluation_results for delete to authenticated
using (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy audit_logs_admin_auditor_select
on public.audit_logs for select to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'auditor'::public.app_role]
));

create policy ai_usage_logs_admin_select
on public.ai_usage_logs for select to authenticated
using (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy reports_authorized_select
on public.reports for select to authenticated
using (public.can_view_comparison(comparison_id));

create policy reports_manager_insert
on public.reports for insert to authenticated
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy reports_manager_update
on public.reports for update to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
))
with check (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy reports_manager_delete
on public.reports for delete to authenticated
using (public.has_org_role(
  organization_id,
  array['administrator'::public.app_role, 'policy_manager'::public.app_role]
));

create policy settings_admin_or_client_select
on public.settings for select to authenticated
using (
  public.has_org_role(organization_id, array['administrator'::public.app_role])
  or (is_client_visible and public.is_org_member(organization_id))
);

create policy settings_admin_insert
on public.settings for insert to authenticated
with check (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy settings_admin_update
on public.settings for update to authenticated
using (public.has_org_role(organization_id, array['administrator'::public.app_role]))
with check (public.has_org_role(organization_id, array['administrator'::public.app_role]));

create policy settings_admin_delete
on public.settings for delete to authenticated
using (public.has_org_role(organization_id, array['administrator'::public.app_role]));

-- Intentionally no policies on rate_limit_buckets. Only the service-role RPC
-- can read or mutate counters. Audit logs, AI usage logs, approval decisions,
-- and checkpoints likewise have no client mutation policy and are append-only
-- or RPC-managed from the authenticated client's perspective.
