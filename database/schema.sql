-- Canonical source for the initial remote migration. Fictional demo data only.
create table public.care_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 0 check (revision >= 0),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bounded_snapshot check (octet_length(snapshot::text) <= 131072),
  constraint valid_snapshot check (
    jsonb_typeof(snapshot) = 'object'
    and snapshot->>'schema' = '1'
    and snapshot->>'scenario' in ('one','two')
    and snapshot->>'phase' in ('prepare','support','handoff','complete','declined')
    and jsonb_typeof(snapshot->'events') = 'array'
    and jsonb_array_length(snapshot->'events') between 1 and 500
    and snapshot ?& array['schema','scenario','phase','events','checks','consent','planReviewed','caregiver','helper','coverage','shift','help','paused','exit','concern']
  )
);
create index care_sessions_owner_updated_idx on public.care_sessions(owner_id, updated_at desc);
alter table public.care_sessions enable row level security;
alter table public.care_sessions force row level security;
revoke all on public.care_sessions from anon, authenticated;
grant select, delete on public.care_sessions to authenticated;
grant insert(owner_id, snapshot) on public.care_sessions to authenticated;
grant update(snapshot) on public.care_sessions to authenticated;
create policy own_sessions_select on public.care_sessions for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy own_sessions_insert on public.care_sessions for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy own_sessions_update on public.care_sessions for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy own_sessions_delete on public.care_sessions for delete to authenticated
  using ((select auth.uid()) = owner_id);

create function public.guard_care_session() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- Serialize this identity's inserts so the per-identity demo cap is race-safe.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text, 0));
    if (select count(*) from public.care_sessions where owner_id = new.owner_id) >= 30 then
      raise exception 'Demo limit reached: this identity already has 30 sessions';
    end if;
    new.revision := 0;
    new.created_at := pg_catalog.now();
  else
    if new.id <> old.id or new.owner_id <> old.owner_id or new.created_at <> old.created_at then
      raise exception 'Session identity and creation time cannot be changed';
    end if;
    new.revision := old.revision + 1;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function public.guard_care_session() from public, anon, authenticated;
create trigger guard_care_session before insert or update on public.care_sessions
  for each row execute function public.guard_care_session();
comment on table public.care_sessions is 'Fictional SteadySide prototype sessions. Not a clinical audit trail or medical record.';
