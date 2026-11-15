-- Teachers can create classrooms and fully manage every classroom they join.
-- College admins retain college-wide access through the existing admin policies.

create or replace function public.create_classroom_for_teacher(
  p_name text,
  p_academic_year text,
  p_branch text,
  p_section text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_classroom_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid()) then
    raise exception 'Teacher profile is not ready.';
  end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_branch), '') is null
     or p_academic_year not in ('1st Year', '2nd Year', '3rd Year', '4th Year') then
    raise exception 'Add a classroom name, valid year and branch.';
  end if;

  insert into public.classrooms(name, academic_year, branch, section, created_by)
  values (trim(p_name), p_academic_year, trim(p_branch), coalesce(trim(p_section), ''), auth.uid())
  returning id into new_classroom_id;

  insert into public.classroom_members(classroom_id, user_id, can_upload, can_manage_content)
  values (new_classroom_id, auth.uid(), true, true);

  return new_classroom_id;
end;
$$;

revoke all on function public.create_classroom_for_teacher(text, text, text, text) from public, anon;
grant execute on function public.create_classroom_for_teacher(text, text, text, text) to authenticated;

-- Give every existing teacher member the same classroom-level capabilities.
update public.classroom_members set can_upload = true, can_manage_content = true;

create or replace function public.can_upload_to_classroom(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_user_is_admin() or exists (
    select 1 from public.classroom_members m where m.classroom_id = target and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_manage_classroom_content(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_user_is_admin() or exists (
    select 1 from public.classroom_members m where m.classroom_id = target and m.user_id = (select auth.uid())
  );
$$;

create policy "classroom members update their classroom details" on public.classrooms
  for update to authenticated using (public.can_manage_classroom_content(id))
  with check (public.can_manage_classroom_content(id));
create policy "classroom members delete their classroom" on public.classrooms
  for delete to authenticated using (public.can_manage_classroom_content(id));

create policy "classroom managers manage memberships" on public.classroom_members
  for all to authenticated using (public.can_manage_classroom_content(classroom_id))
  with check (public.can_manage_classroom_content(classroom_id));
create policy "classroom managers create teacher invites" on public.teacher_invites
  for insert to authenticated with check (public.can_manage_classroom_content(classroom_id));
create policy "classroom managers rotate student links" on public.student_links
  for all to authenticated using (public.can_manage_classroom_content(classroom_id))
  with check (public.can_manage_classroom_content(classroom_id));
