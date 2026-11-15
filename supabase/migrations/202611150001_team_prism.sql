-- Can Notes foundation: each classroom owns its subjects, folders and materials.
-- Run once in Supabase SQL Editor. Storage objects remain in a private bucket.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null default 'Teacher',
  role text not null default 'teacher' check (role in ('admin', 'teacher')),
  created_at timestamptz not null default now(),
  constraint username_format check (username is null or username ~ '^[a-zA-Z0-9._-]{3,40}$')
);

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  academic_year text not null check (academic_year in ('1st Year', '2nd Year', '3rd Year', '4th Year')),
  branch text not null,
  section text not null default '',
  description text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (academic_year, branch, section)
);

create table if not exists public.classroom_members (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_upload boolean not null default true,
  can_manage_content boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (classroom_id, user_id)
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (classroom_id, name),
  unique (id, classroom_id)
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  subject_id uuid not null,
  parent_id uuid,
  name text not null,
  created_at timestamptz not null default now(),
  foreign key (subject_id, classroom_id) references public.subjects(id, classroom_id) on delete cascade,
  foreign key (parent_id, classroom_id) references public.folders(id, classroom_id) on delete cascade,
  unique (id, classroom_id),
  check (parent_id is null or parent_id <> id)
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  subject_id uuid not null,
  folder_id uuid,
  title text not null,
  description text not null default '',
  file_name text not null,
  storage_path text not null unique,
  file_size bigint not null default 0 check (file_size >= 0),
  mime_type text not null default 'application/octet-stream',
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (subject_id, classroom_id) references public.subjects(id, classroom_id) on delete cascade,
  foreign key (folder_id, classroom_id) references public.folders(id, classroom_id) on delete cascade
);

create table if not exists public.teacher_invites (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  code_hash text not null unique,
  can_upload boolean not null default true,
  can_manage_content boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.student_links (
  classroom_id uuid primary key references public.classrooms(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists classroom_members_user_idx on public.classroom_members(user_id);
create index if not exists subjects_classroom_idx on public.subjects(classroom_id);
create index if not exists folders_subject_parent_idx on public.folders(subject_id, parent_id);
create index if not exists materials_classroom_subject_idx on public.materials(classroom_id, subject_id);
create index if not exists teacher_invites_classroom_idx on public.teacher_invites(classroom_id, expires_at);

create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin');
$$;
create or replace function public.can_access_classroom(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_user_is_admin() or exists (
    select 1 from public.classroom_members m where m.classroom_id = target and m.user_id = (select auth.uid())
  );
$$;
create or replace function public.can_upload_to_classroom(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_user_is_admin() or exists (
    select 1 from public.classroom_members m where m.classroom_id = target and m.user_id = (select auth.uid()) and m.can_upload
  );
$$;
create or replace function public.can_manage_classroom_content(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_user_is_admin() or exists (
    select 1 from public.classroom_members m where m.classroom_id = target and m.user_id = (select auth.uid()) and m.can_manage_content
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, username, display_name)
  values (
    new.id,
    nullif(lower(new.raw_user_meta_data ->> 'username'), ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'Teacher'), '@', 1))
  ) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Hashes are compared server-side. Codes are single-use and expire.
create or replace function public.accept_teacher_invite(invite_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.teacher_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into invitation from public.teacher_invites
  where code_hash = encode(extensions.digest(invite_code, 'sha256'), 'hex')
    and accepted_at is null and expires_at > now() for update;
  if not found then raise exception 'That invite is invalid, expired, or already used.'; end if;
  insert into public.classroom_members(classroom_id, user_id, can_upload, can_manage_content)
  values (invitation.classroom_id, auth.uid(), invitation.can_upload, invitation.can_manage_content)
  on conflict (classroom_id, user_id) do update set can_upload = excluded.can_upload, can_manage_content = excluded.can_manage_content;
  update public.teacher_invites set accepted_by = auth.uid(), accepted_at = now() where id = invitation.id;
  return jsonb_build_object('message', 'You joined the classroom.');
end;
$$;

alter table public.profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.subjects enable row level security;
alter table public.folders enable row level security;
alter table public.materials enable row level security;
alter table public.teacher_invites enable row level security;
alter table public.student_links enable row level security;

create policy "users read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()) or public.current_user_is_admin());
create policy "admins update profiles" on public.profiles for update to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins manage classrooms" on public.classrooms for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "teachers read joined classrooms" on public.classrooms for select to authenticated using (public.can_access_classroom(id));
create policy "members read own memberships" on public.classroom_members for select to authenticated using (user_id = (select auth.uid()) or public.current_user_is_admin());
create policy "admins manage memberships" on public.classroom_members for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "members read subjects" on public.subjects for select to authenticated using (public.can_access_classroom(classroom_id));
create policy "admins or content managers create subjects" on public.subjects for insert to authenticated with check (public.can_manage_classroom_content(classroom_id));
create policy "admins or content managers update subjects" on public.subjects for update to authenticated using (public.can_manage_classroom_content(classroom_id)) with check (public.can_manage_classroom_content(classroom_id));
create policy "admins or content managers delete subjects" on public.subjects for delete to authenticated using (public.can_manage_classroom_content(classroom_id));
create policy "members read folders" on public.folders for select to authenticated using (public.can_access_classroom(classroom_id));
create policy "content managers manage folders" on public.folders for all to authenticated using (public.can_manage_classroom_content(classroom_id)) with check (public.can_manage_classroom_content(classroom_id));
create policy "members read materials" on public.materials for select to authenticated using (public.can_access_classroom(classroom_id));
create policy "uploaders add materials" on public.materials for insert to authenticated with check (public.can_upload_to_classroom(classroom_id) and uploaded_by = (select auth.uid()));
create policy "content managers update materials" on public.materials for update to authenticated using (public.can_manage_classroom_content(classroom_id)) with check (public.can_manage_classroom_content(classroom_id));
create policy "content managers delete materials" on public.materials for delete to authenticated using (public.can_manage_classroom_content(classroom_id));
create policy "admins manage invites" on public.teacher_invites for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
create policy "admins manage student links" on public.student_links for all to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.classrooms, public.classroom_members, public.subjects, public.folders, public.materials, public.teacher_invites, public.student_links to authenticated;
grant execute on function public.accept_teacher_invite(text) to authenticated;

-- Private bucket; the first folder in every object path is the classroom UUID.
insert into storage.buckets(id, name, public, file_size_limit)
values ('class-materials', 'class-materials', false, 52428800)
on conflict (id) do update set public = false;
create policy "classroom members read materials in storage" on storage.objects for select to authenticated
  using (bucket_id = 'class-materials' and public.can_access_classroom((storage.foldername(name))[1]::uuid));
create policy "permitted teachers upload to their classroom" on storage.objects for insert to authenticated
  with check (bucket_id = 'class-materials' and public.can_upload_to_classroom((storage.foldername(name))[1]::uuid));
create policy "content managers remove classroom uploads" on storage.objects for delete to authenticated
  using (bucket_id = 'class-materials' and public.can_manage_classroom_content((storage.foldername(name))[1]::uuid));

-- First administrator setup: after creating a Supabase Auth user, run:
-- update public.profiles set role = 'admin' where id = 'AUTH_USER_UUID';

create table if not exists public.teacher_login_attempts (
  id bigint generated always as identity primary key,
  address_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists teacher_login_attempts_recent_idx on public.teacher_login_attempts(address_hash, created_at desc);
alter table public.teacher_login_attempts enable row level security;
revoke all on public.teacher_login_attempts from anon, authenticated;
