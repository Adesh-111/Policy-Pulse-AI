-- Supabase Storage is the only durable file store. Object keys are immutable and
-- scoped as organization_id/document_id/sanitized-filename.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'policy-documents',
  'policy-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

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
        and public.can_view_comparison(r.comparison_id)
    )
  )
);

drop policy if exists policy_documents_manager_insert on storage.objects;
create policy policy_documents_manager_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'policy-documents'
  and public.storage_object_organization(name) is not null
  and public.has_org_role(
    public.storage_object_organization(name),
    array['administrator'::public.app_role, 'policy_manager'::public.app_role]
  )
  and exists (
    select 1
    from public.documents d
    where d.storage_bucket = bucket_id
      and d.storage_path = name
      and d.organization_id = public.storage_object_organization(name)
  )
);

drop policy if exists policy_documents_manager_update on storage.objects;
create policy policy_documents_manager_update
on storage.objects for update to authenticated
using (
  bucket_id = 'policy-documents'
  and public.has_org_role(
    public.storage_object_organization(name),
    array['administrator'::public.app_role, 'policy_manager'::public.app_role]
  )
)
with check (
  bucket_id = 'policy-documents'
  and public.has_org_role(
    public.storage_object_organization(name),
    array['administrator'::public.app_role, 'policy_manager'::public.app_role]
  )
  and exists (
    select 1
    from public.documents d
    where d.storage_bucket = bucket_id
      and d.storage_path = name
      and d.organization_id = public.storage_object_organization(name)
  )
);

drop policy if exists policy_documents_manager_delete on storage.objects;
create policy policy_documents_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'policy-documents'
  and public.has_org_role(
    public.storage_object_organization(name),
    array['administrator'::public.app_role, 'policy_manager'::public.app_role]
  )
);

comment on function public.storage_object_organization(text) is
  'Returns the UUID tenant prefix of a valid Storage object key, otherwise NULL.';
