-- Keep role/status and department scopes in one authorization-checked transaction.

create or replace function public.update_membership_access(
  p_organization_id uuid,
  p_user_id uuid,
  p_role public.app_role,
  p_status public.membership_status,
  p_department_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.memberships%rowtype;
  v_before jsonb;
  v_department_ids uuid[] := coalesce(p_department_ids, '{}'::uuid[]);
  v_distinct_count integer;
  v_valid_count integer;
begin
  if auth.uid() is null or not public.has_org_role(
    p_organization_id,
    array['administrator'::public.app_role]
  ) then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid()
     and (p_role <> 'administrator'::public.app_role or p_status <> 'active'::public.membership_status) then
    raise exception 'Administrators cannot remove or suspend their own administrative access'
      using errcode = '55000';
  end if;

  select * into v_membership
  from public.memberships
  where organization_id = p_organization_id
    and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Membership not found' using errcode = 'P0002';
  end if;

  select count(distinct department_id)
  into v_distinct_count
  from unnest(v_department_ids) as scoped(department_id);
  if p_role = 'department_user'::public.app_role and v_distinct_count = 0 then
    raise exception 'Department users require at least one department'
      using errcode = '23514';
  end if;
  select count(*) into v_valid_count
  from public.departments
  where organization_id = p_organization_id
    and is_active
    and id = any(v_department_ids);
  if v_valid_count <> v_distinct_count then
    raise exception 'One or more department scopes are invalid or inactive'
      using errcode = '23514';
  end if;

  v_before := to_jsonb(v_membership);
  update public.memberships
  set role = p_role,
      status = p_status,
      department_id = v_department_ids[1]
  where id = v_membership.id
  returning * into v_membership;

  delete from public.profile_departments
  where organization_id = p_organization_id
    and user_id = p_user_id;

  insert into public.profile_departments (
    organization_id, user_id, department_id, assigned_by
  )
  select p_organization_id, p_user_id, department_id, auth.uid()
  from (select distinct unnest(v_department_ids) as department_id) scoped;

  update public.profiles
  set default_organization_id = p_organization_id,
      department_id = v_department_ids[1]
  where id = p_user_id;

  perform public.write_audit_log(
    p_organization_id,
    'membership.updated',
    'membership',
    v_membership.id::text,
    v_before,
    to_jsonb(v_membership) || jsonb_build_object('departmentIds', v_department_ids),
    '{}'::jsonb
  );

  return to_jsonb(v_membership) || jsonb_build_object('departmentIds', v_department_ids);
end;
$$;

revoke all on function public.update_membership_access(
  uuid, uuid, public.app_role, public.membership_status, uuid[]
) from public, anon;
grant execute on function public.update_membership_access(
  uuid, uuid, public.app_role, public.membership_status, uuid[]
) to authenticated, service_role;
