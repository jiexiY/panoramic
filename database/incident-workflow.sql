-- Fresh-install Panoramic shared response schema. Apply after schema.sql.
-- The hosted project has an older baseline. This file is NOT an upgrade migration.
-- Do not rerun against existing tables; prepare a reviewed ALTER/function migration first.
-- Writes are transactional commands; clients cannot alter audit history directly.
create schema if not exists panoramic_private;
revoke all on schema panoramic_private from public, anon;
grant usage on schema panoramic_private to authenticated;

create table public.care_facilities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id),
  name text not null check (length(name) between 2 and 80),
  created_at timestamptz not null default now()
);
create table public.care_members (
  facility_id uuid not null references public.care_facilities(id),
  user_id uuid not null references auth.users(id),
  display_name text not null check (length(display_name) between 2 and 40),
  role text not null check (role in ('coordinator','caregiver')),
  qualified boolean not null default false,
  available boolean not null default false,
  available_until timestamptz,
  response_order integer not null default 1 check (response_order between 1 and 20),
  primary key (facility_id, user_id)
);
create index care_members_user on public.care_members(user_id,facility_id);
create table public.care_incidents (
  id uuid primary key,
  facility_id uuid not null references public.care_facilities(id),
  created_by uuid not null references auth.users(id),
  room text not null check (room in ('A101','A102','A103','A104')),
  zone text not null check (zone in ('Bathroom','Bedroom','Living area')),
  observation jsonb not null check (octet_length(observation::text) < 16000),
  route jsonb,
  priority text not null check (priority in ('unassessed','away','near','crossing')),
  media_name text not null check (length(media_name) between 1 and 150),
  frame_time numeric check (frame_time >= 0),
  evidence_path text,
  phase text not null default 'flagged' check (phase in ('flagged','dispatched','acknowledged','arrived','resolved')),
  suggested_to uuid,
  assigned_to uuid,
  resolution text not null default '',
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  due_at timestamptz not null default now() + interval '2 minutes',
  escalated_at timestamptz,
  foreign key (facility_id,suggested_to) references public.care_members(facility_id,user_id),
  foreign key (facility_id,assigned_to) references public.care_members(facility_id,user_id)
);
create index care_incidents_queue on public.care_incidents(facility_id,created_at desc);
create index care_incidents_creator on public.care_incidents(created_by);
create index care_incidents_suggested on public.care_incidents(facility_id,suggested_to);
create index care_incidents_assigned on public.care_incidents(facility_id,assigned_to);
create index care_incidents_due on public.care_incidents(due_at) where phase <> 'resolved' and escalated_at is null;
-- A caregiver cannot be reserved for two open responses, even across concurrent requests.
create unique index care_one_response on public.care_incidents(assigned_to) where phase in ('dispatched','acknowledged','arrived');
create table public.care_incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.care_incidents(id),
  facility_id uuid not null references public.care_facilities(id),
  actor_id uuid references auth.users(id),
  action text not null,
  detail text not null,
  created_at timestamptz not null default now(),
  request_id uuid not null unique
);
create index care_events_incident on public.care_incident_events(incident_id,created_at);
create index care_events_facility on public.care_incident_events(facility_id);
create index care_events_actor on public.care_incident_events(actor_id);

alter table public.care_facilities enable row level security;
alter table public.care_members enable row level security;
alter table public.care_incidents enable row level security;
alter table public.care_incident_events enable row level security;
revoke all on public.care_facilities,public.care_members,public.care_incidents,public.care_incident_events from anon,authenticated;
grant select on public.care_facilities,public.care_members,public.care_incidents,public.care_incident_events to authenticated;

-- Narrow private lookup prevents recursive membership RLS. Never trusts user_metadata.
create function panoramic_private.is_member(f uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.care_members where facility_id=f and user_id=(select auth.uid()));
$$;
revoke all on function panoramic_private.is_member(uuid) from public,anon;
grant execute on function panoramic_private.is_member(uuid) to authenticated;
create policy facility_team_read on public.care_facilities for select to authenticated using (panoramic_private.is_member(id));
create policy member_team_read on public.care_members for select to authenticated using (panoramic_private.is_member(facility_id));
create policy incident_team_read on public.care_incidents for select to authenticated using (panoramic_private.is_member(facility_id));
create policy event_team_read on public.care_incident_events for select to authenticated using (panoramic_private.is_member(facility_id));

create function panoramic_private.command(action text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid(); f uuid; target uuid; candidate uuid; request uuid;
  member public.care_members; incident public.care_incidents; prior public.care_incident_events;
  item jsonb; box jsonb; description text; created uuid;
begin
  if actor is null or not exists(select 1 from auth.users where id=actor and not is_anonymous and email_confirmed_at is not null) then
    raise exception 'Sign in with a confirmed care-team account.' using errcode='42501';
  end if;
  if payload is null or octet_length(payload::text)>24000 then raise exception 'Invalid command.'; end if;
  if action='create_facility' then
    insert into public.care_facilities(owner_id,name) values(actor,trim(payload->>'name'))
      on conflict(owner_id) do update set owner_id=excluded.owner_id returning id into f;
    insert into public.care_members(facility_id,user_id,display_name,role)
      values(f,actor,trim(payload->>'display_name'),'coordinator') on conflict do nothing;
    return jsonb_build_object('facility_id',f);
  end if;
  f := (payload->>'facility_id')::uuid;
  -- Serialize commands per facility. All clients observe one authoritative order.
  perform 1 from public.care_facilities where id=f for update;
  select * into member from public.care_members where facility_id=f and user_id=actor;
  if not found then raise exception 'You do not have access to this facility.' using errcode='42501'; end if;
  if action='add_member' then
    if member.role<>'coordinator' then raise exception 'Only the coordinator can manage the team.' using errcode='42501'; end if;
    select id into target from auth.users where lower(email)=lower(trim(payload->>'email')) and email_confirmed_at is not null and not is_anonymous;
    if target is null then raise exception 'The caregiver must first create and confirm an account.'; end if;
    if (select count(*) from public.care_members where facility_id=f)>=20 and not exists(select 1 from public.care_members where facility_id=f and user_id=target) then raise exception 'This workspace supports 20 team members.'; end if;
    insert into public.care_members(facility_id,user_id,display_name,role,qualified,response_order)
      values(f,target,trim(payload->>'display_name'),'caregiver',coalesce((payload->>'qualified')::boolean,false),coalesce((payload->>'response_order')::integer,1))
      on conflict(facility_id,user_id) do update set display_name=excluded.display_name,qualified=excluded.qualified,response_order=excluded.response_order;
    return jsonb_build_object('user_id',target);
  elsif action in ('availability','heartbeat') then
    if action='availability' then
      if coalesce((payload->>'available')::boolean,false) and (not member.qualified or exists(select 1 from public.care_incidents where assigned_to=actor and phase in ('dispatched','acknowledged','arrived'))) then raise exception 'You are not eligible or already handling a response.'; end if;
      update public.care_members set available=coalesce((payload->>'available')::boolean,false),available_until=now()+interval '90 seconds' where facility_id=f and user_id=actor;
    else
      update public.care_members set available_until=now()+interval '90 seconds' where facility_id=f and user_id=actor and available;
    end if;
    return jsonb_build_object('ok',true);
  elsif action='publish' then
    created := (payload->>'id')::uuid;
    select * into incident from public.care_incidents where id=created;
    if found then
      if incident.facility_id<>f or incident.created_by<>actor then raise exception 'Record conflict.'; end if;
      return to_jsonb(incident);
    end if;
    if (select count(*) from public.care_incidents where facility_id=f and phase<>'resolved')>=100 then raise exception 'Review the open response queue before adding more concerns.'; end if;
    if jsonb_typeof(payload->'observation'->'model') is distinct from 'string' or
      jsonb_typeof(payload->'observation'->'analyzedAt') is distinct from 'string' or
      jsonb_typeof(payload->'observation'->'scene'->'brief') is distinct from 'string' or
      jsonb_typeof(payload->'observation'->'scene'->'uncertainty') is distinct from 'string' or
      payload->'observation'->>'source' is distinct from 'gemini' or
      length(coalesce(payload->'observation'->>'model','')) not between 1 and 100 or
      length(coalesce(payload->'observation'->'scene'->>'brief','')) not between 1 and 600 or
      length(coalesce(payload->'observation'->'scene'->>'uncertainty',''))>400 or
      jsonb_typeof(payload->'observation'->'scene'->'observations') is distinct from 'array' then raise exception 'Invalid observation.'; end if;
    if jsonb_array_length(payload->'observation'->'scene'->'observations') not between 1 and 8 then raise exception 'Invalid observation count.'; end if;
    if not exists(select 1 from jsonb_array_elements(payload->'observation'->'scene'->'observations') o where o->>'kind' in ('possible_spill','possible_trip')) then raise exception 'No candidate hazard to publish.'; end if;
    for item in select * from jsonb_array_elements(payload->'observation'->'scene'->'observations') loop
      box := item->'box';
      if jsonb_typeof(item->'label') is distinct from 'string' or jsonb_typeof(item->'evidence') is distinct from 'string' or coalesce(item->>'kind','') not in ('object','possible_spill','possible_trip') or length(coalesce(item->>'label','')) not between 1 and 80 or length(coalesce(item->>'evidence','')) not between 1 and 300 or jsonb_typeof(box) is distinct from 'array' then raise exception 'Invalid detection.'; end if;
      if jsonb_array_length(box)<>4 or exists(select 1 from jsonb_array_elements(box) v where jsonb_typeof(v)<>'number') or exists(select 1 from jsonb_array_elements_text(box) v where v::numeric<0 or v::numeric>1000 or v::numeric<>floor(v::numeric)) or (box->>0)::numeric>=(box->>2)::numeric or (box->>1)::numeric>=(box->>3)::numeric then raise exception 'Invalid detection bounds.'; end if;
    end loop;
    if payload->'route' is not null and payload->'route'<>'null'::jsonb then
      item := payload->'route';
      if jsonb_typeof(item->'name') is distinct from 'string' or jsonb_typeof(item->'points') is distinct from 'array' or length(coalesce(item->>'name','')) not between 1 and 80 or coalesce(item->>'source','') not in ('recording','caregiver-marked') or jsonb_typeof(item->'margin') is distinct from 'number' then raise exception 'Invalid route.'; end if;
      if jsonb_array_length(item->'points') not between 2 and 12 or (item->>'margin')::numeric not between 0 and 150 then raise exception 'Invalid route bounds.'; end if;
      for box in select * from jsonb_array_elements(item->'points') loop
        if jsonb_typeof(box->'x') is distinct from 'number' or jsonb_typeof(box->'y') is distinct from 'number' then raise exception 'Invalid route point.'; end if;
        if (box->>'x')::numeric not between 0 and 1000 or (box->>'y')::numeric not between 0 and 1000 then raise exception 'Invalid route point.'; end if;
      end loop;
    elsif payload->>'priority' is distinct from 'unassessed' then raise exception 'Confirm a route before assigning route priority.';
    end if;
    select user_id into candidate from public.care_members m where m.facility_id=f and m.available and m.qualified and m.available_until>now()
      and not exists(select 1 from public.care_incidents i where i.assigned_to=m.user_id and i.phase in ('dispatched','acknowledged','arrived')) order by response_order,user_id limit 1;
    insert into public.care_incidents(id,facility_id,created_by,room,zone,observation,route,priority,media_name,frame_time,suggested_to)
      values(created,f,actor,payload->>'room',payload->>'zone',payload->'observation',payload->'route',payload->>'priority',payload->>'media_name',(payload->>'frame_time')::numeric,candidate) returning * into incident;
    insert into public.care_incident_events(incident_id,facility_id,actor_id,action,detail,request_id)
      values(created,f,actor,'flagged','Concern added to the supervision queue. Assignment pending.',created);
    return to_jsonb(incident);
  end if;
  select * into incident from public.care_incidents where id=(payload->>'id')::uuid and facility_id=f for update;
  if not found then raise exception 'Response not found.'; end if;
  request := (payload->>'request_id')::uuid;
  if request is null then raise exception 'A request ID is required.'; end if;
  select * into prior from public.care_incident_events where request_id=request;
  if found then
    if prior.incident_id<>incident.id or prior.actor_id is distinct from actor or prior.action<>action then raise exception 'Request ID conflict.'; end if;
    return to_jsonb(incident);
  end if;
  if (payload->>'version')::integer is distinct from incident.version then raise exception 'This response changed. Refresh before trying again.' using errcode='40001'; end if;
  if action='attach_evidence' then
    if incident.created_by<>actor or incident.evidence_path is not null or payload->>'path' <> f::text||'/'||actor::text||'/'||incident.id::text||'.jpg' or not exists(select 1 from storage.objects where bucket_id='care-evidence' and name=payload->>'path') then raise exception 'Evidence is not available.'; end if;
    update public.care_incidents set evidence_path=payload->>'path' where id=incident.id;
    description := 'Private reference frame attached.';
  elsif action='dispatch' then
    if member.role<>'coordinator' then raise exception 'Only the coordinator can assign a response.' using errcode='42501'; end if;
    if incident.phase not in ('flagged','dispatched') then raise exception 'An accepted response cannot be reassigned here.'; end if;
    target := (payload->>'caregiver_id')::uuid;
    select display_name into description from public.care_members where facility_id=f and user_id=target and qualified and available and available_until>now() for update;
    if not found then raise exception 'This caregiver is no longer available or eligible. Refresh the team.'; end if;
    if exists(select 1 from public.care_incidents where assigned_to=target and phase in ('dispatched','acknowledged','arrived')) then raise exception 'This caregiver already has an open response.'; end if;
    update public.care_incidents set assigned_to=target,phase='dispatched',due_at=now()+interval '2 minutes',escalated_at=null where id=incident.id;
    update public.care_members set available=false where facility_id=f and user_id=target;
    description := member.display_name||' assigned the response to '||description||'. Acceptance pending.';
  elsif action='decline' then
    if incident.phase<>'dispatched' or incident.assigned_to is distinct from actor or length(trim(coalesce(payload->>'note',''))) not between 8 and 1000 then raise exception 'Only the requested caregiver can decline, with a reason (8–1000 characters).'; end if;
    update public.care_incidents set phase='flagged',assigned_to=null,suggested_to=null,escalated_at=now(),due_at=now() where id=incident.id;
    description := member.display_name||' could not respond: '||trim(payload->>'note')||'. Returned to supervision for reassignment.';
  elsif action='acknowledge' then
    if incident.phase<>'dispatched' or incident.assigned_to is distinct from actor or not member.qualified then raise exception 'Only the assigned, eligible caregiver can accept this response.'; end if;
    if exists(select 1 from public.care_incidents where assigned_to=actor and id<>incident.id and phase in ('dispatched','acknowledged','arrived')) then raise exception 'Finish your current response before accepting another.'; end if;
    update public.care_incidents set assigned_to=actor,phase='acknowledged',due_at=now()+interval '3 minutes',escalated_at=null where id=incident.id;
    update public.care_members set available=false where facility_id=f and user_id=actor;
    description := member.display_name||' accepted the response. Arrival pending.';
  elsif action='arrive' then
    if incident.phase<>'acknowledged' or incident.assigned_to<>actor then raise exception 'Only the assigned caregiver can confirm arrival.'; end if;
    update public.care_incidents set phase='arrived',due_at=now()+interval '10 minutes',escalated_at=null where id=incident.id;
    description := member.display_name||' confirmed arrival.';
  elsif action='resolve' then
    if incident.phase<>'arrived' or incident.assigned_to<>actor or length(trim(coalesce(payload->>'note',''))) not between 8 and 1000 then raise exception 'Confirm arrival and describe the outcome (8–1000 characters).'; end if;
    update public.care_incidents set phase='resolved',resolution=trim(payload->>'note'),escalated_at=null where id=incident.id;
    description := member.display_name||' recorded: '||trim(payload->>'note');
  else raise exception 'Unknown command.';
  end if;
  update public.care_incidents set version=version+1,updated_at=now() where id=incident.id returning * into incident;
  insert into public.care_incident_events(incident_id,facility_id,actor_id,action,detail,request_id) values(incident.id,f,actor,action,description,request);
  return to_jsonb(incident);
end;
$$;
revoke all on function panoramic_private.command(text,jsonb) from public,anon;
grant execute on function panoramic_private.command(text,jsonb) to authenticated;
-- Exposed wrapper does not itself elevate privileges. Private command checks identity,
-- facility membership, role, expected revision and legal transition on every write.
create function public.care_command(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select panoramic_private.command(action,payload); $$;
revoke all on function public.care_command(text,jsonb) from public,anon;
grant execute on function public.care_command(text,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('care-evidence','care-evidence',false,1500000,array['image/jpeg']);
create policy evidence_team_read on storage.objects for select to authenticated using(bucket_id='care-evidence' and exists(select 1 from public.care_incidents i where i.evidence_path=name));
create policy evidence_owner_upload on storage.objects for insert to authenticated with check(bucket_id='care-evidence' and exists(select 1 from public.care_incidents i where i.created_by=(select auth.uid()) and i.evidence_path is null and name=i.facility_id::text||'/'||i.created_by::text||'/'||i.id::text||'.jpg'));

-- Unanswered requests are escalated in the database even with every browser closed.
create function panoramic_private.escalate_due() returns integer language plpgsql security invoker set search_path='' as $$
declare r public.care_incidents; n integer:=0;
begin
  for r in select * from public.care_incidents where phase<>'resolved' and escalated_at is null and due_at<=now() order by due_at limit 100 for update skip locked loop
    update public.care_incidents set escalated_at=now(),updated_at=now(),version=version+1 where id=r.id;
    insert into public.care_incident_events(incident_id,facility_id,action,detail,request_id) values(r.id,r.facility_id,'escalated',case r.phase when 'flagged' then 'No assignment within 2 minutes. Coordinator attention required.' when 'dispatched' then 'No acknowledgment within 2 minutes. Coordinator attention required.' when 'acknowledged' then 'Arrival not confirmed within 3 minutes. Coordinator attention required.' else 'Response remains open after 10 minutes. Coordinator follow-up required.' end,gen_random_uuid());
    n:=n+1;
  end loop;
  return n;
end;
$$;
revoke all on function panoramic_private.escalate_due() from public,anon,authenticated;
create extension if not exists pg_cron;
select cron.schedule('panoramic-response-escalation','30 seconds','select panoramic_private.escalate_due()');

alter publication supabase_realtime add table public.care_incidents,public.care_incident_events,public.care_members;
