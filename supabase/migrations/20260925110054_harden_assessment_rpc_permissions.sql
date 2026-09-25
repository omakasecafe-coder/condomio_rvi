revoke execute on function public.admin_create_assessment_version(text) from anon;
revoke execute on function public.admin_save_assessment_set(uuid, text, integer, integer, boolean, jsonb) from anon;
revoke execute on function public.admin_publish_assessment_set(uuid) from anon;
revoke execute on function public.submit_assessment_attempt(uuid, jsonb) from anon;

drop policy admin_read_self on public.admin_users;
create policy admin_read_self on public.admin_users
  for select to authenticated
  using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')));
