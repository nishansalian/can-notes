alter table public.student_links
  add column if not exists link_generation integer not null default 1;

do $body$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'student_links_link_generation_positive'
  ) then
    alter table public.student_links
      add constraint student_links_link_generation_positive check (link_generation > 0);
  end if;
end;
$body$;
