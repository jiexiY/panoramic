-- Preserve existing records. A caregiver outcome no longer closes a concern.
-- Version matches the applied hosted migration.
-- Only the two station checks may close a newly reviewed response.
alter table public.care_members drop constraint care_members_role_check;
alter table public.care_members add constraint care_members_role_check check (role in ('coordinator','caregiver','nurse'));
alter table public.care_incidents
  add column review_observation jsonb check (octet_length(review_observation::text)<16000),
  add column closure_requested boolean not null default false,
  add column supervision_checked_by uuid references auth.users(id),
  add column nursing_checked_by uuid references auth.users(id);
create index care_incidents_supervision_checker on public.care_incidents(supervision_checked_by);
create index care_incidents_nursing_checker on public.care_incidents(nursing_checked_by);

create function panoramic_private.prevention_command(action text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); f uuid; member public.care_members; incident public.care_incidents;
  prior public.care_incident_events; request uuid; result jsonb; observation jsonb; item jsonb; box jsonb;
  observed_at timestamptz; description text; hazard boolean; target uuid;
begin
  if actor is null or not exists(select 1 from auth.users where id=actor and not is_anonymous and email_confirmed_at is not null) then
    raise exception 'Sign in with a confirmed care-team account.' using errcode='42501';
  end if;
  if payload is null or octet_length(payload::text)>24000 then raise exception 'Invalid command.'; end if;
  if action='create_facility' then return panoramic_private.command(action,payload); end if;
  f := (payload->>'facility_id')::uuid;
  perform 1 from public.care_facilities where id=f for update;
  select * into member from public.care_members where facility_id=f and user_id=actor;
  if not found then raise exception 'You do not have access to this facility.' using errcode='42501'; end if;
  if action='add_member' then
    if coalesce(payload->>'role','caregiver') not in ('caregiver','nurse') then raise exception 'Choose caregiver or nursing station.'; end if;
    result := panoramic_private.command(action,payload);
    target := (result->>'user_id')::uuid;
    update public.care_members set role=coalesce(payload->>'role','caregiver') where facility_id=f and user_id=target and role<>'coordinator';
    return result;
  elsif action='publish' then
    result := panoramic_private.command(action,payload);
    if not exists(select 1 from public.care_incident_events e where e.incident_id=(result->>'id')::uuid and e.action='station_request') then
      insert into public.care_incident_events(incident_id,facility_id,actor_id,action,detail,request_id)
      values((result->>'id')::uuid,f,actor,'station_request','Panoramic routed the concern to the built-in supervision station. Review the evidence and assign an available responder. No external system was contacted.',gen_random_uuid());
    end if;
    return result;
  elsif action not in ('resolve','review_observation','supervision_check','nursing_check') then
    return panoramic_private.command(action,payload);
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
  if incident.phase='resolved' then raise exception 'This activity is closed. Publish a new concern for a new hazard.'; end if;
  if action='review_observation' then
    observation:=payload->'observation';
    if payload->>'room' is distinct from incident.room or payload->>'zone' is distinct from incident.zone then raise exception 'Follow-up frame must match the same room and area.'; end if;
    if observation->>'source' is distinct from 'gemini'
      or jsonb_typeof(observation->'model') is distinct from 'string' or length(coalesce(observation->>'model','')) not between 1 and 100
      or jsonb_typeof(observation->'analyzedAt') is distinct from 'string'
      or jsonb_typeof(observation->'scene'->'brief') is distinct from 'string' or length(coalesce(observation->'scene'->>'brief','')) not between 1 and 600
      or jsonb_typeof(observation->'scene'->'uncertainty') is distinct from 'string' or length(coalesce(observation->'scene'->>'uncertainty','')) not between 1 and 400
      or jsonb_typeof(observation->'scene'->'observations') is distinct from 'array' then raise exception 'Invalid follow-up observation.'; end if;
    observed_at:=(observation->>'analyzedAt')::timestamptz;
    if observed_at < now()-interval '5 minutes' or observed_at>now()+interval '30 seconds'
      or observed_at<=coalesce((incident.review_observation->>'analyzedAt')::timestamptz,(incident.observation->>'analyzedAt')::timestamptz) then raise exception 'Use a fresh follow-up frame newer than the last observation.'; end if;
    if jsonb_array_length(observation->'scene'->'observations')>8 then raise exception 'Invalid observation count.'; end if;
    for item in select * from jsonb_array_elements(observation->'scene'->'observations') loop
      box:=item->'box';
      if jsonb_typeof(item->'label') is distinct from 'string' or length(coalesce(item->>'label','')) not between 1 and 80
        or jsonb_typeof(item->'evidence') is distinct from 'string' or length(coalesce(item->>'evidence','')) not between 1 and 300
        or coalesce(item->>'kind','') not in ('object','possible_spill','possible_trip') or jsonb_typeof(box) is distinct from 'array' then raise exception 'Invalid detection.'; end if;
      if jsonb_array_length(box)<>4 or exists(select 1 from jsonb_array_elements(box) v where jsonb_typeof(v)<>'number') or exists(select 1 from jsonb_array_elements_text(box) v where v::numeric<0 or v::numeric>1000 or v::numeric<>floor(v::numeric)) or (box->>0)::numeric>=(box->>2)::numeric or (box->>1)::numeric>=(box->>3)::numeric then raise exception 'Invalid detection bounds.'; end if;
    end loop;
    hazard:=exists(select 1 from jsonb_array_elements(observation->'scene'->'observations') o where o->>'kind'<>'object');
    if hazard and (coalesce(payload->>'priority','') not in ('unassessed','away','near','crossing') or (incident.route is null or incident.route='null'::jsonb) and payload->>'priority'<>'unassessed') then raise exception 'Invalid follow-up route priority.'; end if;
    update public.care_incidents set review_observation=payload->'observation',supervision_checked_by=null,nursing_checked_by=null,
      priority=case when hazard then payload->>'priority' else priority end,
      closure_requested=case when hazard then false else closure_requested end where id=incident.id;
    description:=case when hazard then 'Follow-up frame still flags a possible hazard. Safety sign-offs invalidated; caregiver review required.' else 'No candidate hazard in the follow-up frame. Physical safety check requested; activity remains open.' end;
  elsif action='resolve' then
    if incident.phase<>'arrived' or incident.assigned_to is distinct from actor or length(trim(coalesce(payload->>'note',''))) not between 8 and 1000 then raise exception 'Confirm arrival and describe the outcome (8–1000 characters).'; end if;
    update public.care_incidents set resolution=trim(payload->>'note'),closure_requested=true,supervision_checked_by=null,nursing_checked_by=null,due_at=now()+interval '10 minutes',escalated_at=null where id=incident.id;
    description:=member.display_name||' recorded: '||trim(payload->>'note')||'. Awaiting clear follow-up evidence and both station sign-offs.';
  else
    if incident.phase<>'arrived' or not incident.closure_requested or incident.review_observation is null
      or exists(select 1 from jsonb_array_elements(incident.review_observation->'scene'->'observations') o where o->>'kind'<>'object') then raise exception 'A clear follow-up frame and caregiver outcome are required before sign-off.'; end if;
    if (incident.review_observation->>'analyzedAt')::timestamptz<now()-interval '5 minutes' then raise exception 'The follow-up frame is stale. Review a fresh frame before signing off.'; end if;
    if action='supervision_check' then
      if member.role<>'coordinator' or incident.supervision_checked_by is not null then raise exception 'Only supervision can perform this check, once.' using errcode='42501'; end if;
      update public.care_incidents set supervision_checked_by=actor where id=incident.id;
      description:='Supervision station confirmed the physical safety check. Nursing sign-off requested.';
    else
      if member.role<>'nurse' or incident.supervision_checked_by is null or incident.supervision_checked_by=actor or incident.nursing_checked_by is not null then raise exception 'An independent nursing station must sign off after supervision.' using errcode='42501'; end if;
      update public.care_incidents set nursing_checked_by=actor,phase='resolved',escalated_at=null where id=incident.id;
      description:='Nursing station checked off the response. Both stations confirmed; activity closed.';
    end if;
  end if;
  update public.care_incidents set version=version+1,updated_at=now() where id=incident.id returning * into incident;
  insert into public.care_incident_events(incident_id,facility_id,actor_id,action,detail,request_id) values(incident.id,f,actor,action,description,request);
  return to_jsonb(incident);
end;
$$;
-- Clients cannot call the old command to bypass the new closure gates.
revoke all on function panoramic_private.command(text,jsonb) from authenticated;
revoke all on function panoramic_private.prevention_command(text,jsonb) from public,anon;
grant execute on function panoramic_private.prevention_command(text,jsonb) to authenticated;
create or replace function public.care_command(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select panoramic_private.prevention_command(action,payload); $$;
