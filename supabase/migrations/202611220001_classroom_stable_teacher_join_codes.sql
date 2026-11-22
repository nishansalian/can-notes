-- One reusable teacher join code per classroom. Teachers can share it with colleagues;
-- the owning teacher or college admin can rotate it if it is exposed too widely.
create table if not exists public.classroom_join_codes (
  classroom_id uuid primary key references public.classrooms(id) on delete cascade,
  code_hash text not null unique,
  code_value text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.classroom_join_codes enable row level security;
revoke all on table public.classroom_join_codes from anon, authenticated;
grant select, insert, update, delete on table public.classroom_join_codes to service_role;

create or replace function public.accept_teacher_invite(invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stable_code public.classroom_join_codes%rowtype;
  invitation public.teacher_invites%rowtype;
  target_classroom uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;

  select * into stable_code
  from public.classroom_join_codes
  where code_hash = encode(extensions.digest(upper(trim(invite_code)), 'sha256'), 'hex');

  if found then
    target_classroom := stable_code.classroom_id;
  else
    -- Continue to honor any older, unexpired single-use invitations.
    select * into invitation
    from public.teacher_invites
    where code_hash = encode(extensions.digest(invite_code, 'sha256'), 'hex')
      and accepted_at is null and expires_at > now()
    for update;

    if not found then raise exception 'That classroom code is invalid or has been rotated.'; end if;
    target_classroom := invitation.classroom_id;
    update public.teacher_invites
      set accepted_by = auth.uid(), accepted_at = now()
      where id = invitation.id;
  end if;

  insert into public.classroom_members(classroom_id, user_id, can_upload, can_manage_content)
  values (target_classroom, auth.uid(), true, true)
  on conflict (classroom_id, user_id) do update
    set can_upload = true, can_manage_content = true;

  return jsonb_build_object('message', 'You joined the classroom.');
end;
$$;

revoke all on function public.accept_teacher_invite(text) from public, anon;
grant execute on function public.accept_teacher_invite(text) to authenticated;
