-- Disposable identities and records exist only inside this rolled-back transaction.
begin;
create temporary table qa_ids(label text primary key,id uuid not null default gen_random_uuid());
insert into qa_ids(label) values('coordinator'),('caregiver'),('outsider'),('incident'),('claim'),('arrival'),('resolve');
insert into auth.users(id,aud,role,email,email_confirmed_at,is_anonymous)
  select id,'authenticated','authenticated','panoramic-qa-'||label||'-'||id::text||'@example.invalid',now(),false from qa_ids where label in ('coordinator','caregiver','outsider');
create temporary table qa_values(label text primary key,value jsonb);
grant select on qa_ids to authenticated;
grant all on qa_values to authenticated;
create function pg_temp.check_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAILED: %',label;end if;end;$$;
grant execute on function pg_temp.check_true(boolean,text) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_ids where label='coordinator'),'role','authenticated')::text,true);
insert into qa_values values('workspace',public.care_command('create_facility',jsonb_build_object('name','Rollback verification','display_name','QA coordinator')));
select public.care_command('add_member',jsonb_build_object('facility_id',(select value->>'facility_id' from qa_values where label='workspace'),'email','panoramic-qa-caregiver-'||(select id from qa_ids where label='caregiver')::text||'@example.invalid','display_name','QA caregiver','qualified',true,'response_order',1));
select pg_temp.check_true((select count(*)=2 from public.care_members),'coordinator sees two team members');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_ids where label='caregiver'),'role','authenticated')::text,true);
select public.care_command('availability',jsonb_build_object('facility_id',(select value->>'facility_id' from qa_values where label='workspace'),'available',true));
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_ids where label='coordinator'),'role','authenticated')::text,true);
insert into qa_values values('published',public.care_command('publish',jsonb_build_object('facility_id',(select value->>'facility_id' from qa_values where label='workspace'),'id',(select id from qa_ids where label='incident'),'room','A102','zone','Bathroom','priority','unassessed','media_name','verification-frame.jpg','route',null,'observation',jsonb_build_object('source','gemini','model','test-fixture-not-provider-output','analyzedAt',now(),'scene',jsonb_build_object('brief','Possible floor obstruction for review.','uncertainty','Synthetic contract fixture; no model was called.','observations',jsonb_build_array(jsonb_build_object('kind','possible_trip','label','Object','box',jsonb_build_array(400,400,600,600),'evidence','Synthetic test geometry.'))))))));
select pg_temp.check_true((select value->>'suggested_to'=(select id::text from qa_ids where label='caregiver') from qa_values where label='published'),'available eligible caregiver suggested');
-- An outsider with a valid authenticated identity sees no facility data and cannot mutate it.
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_ids where label='outsider'),'role','authenticated')::text,true);
select pg_temp.check_true((select count(*)=0 from public.care_incidents),'outsider incident isolation');
select pg_temp.check_true((select count(*)=0 from public.care_incident_events),'outsider event isolation');
select pg_temp.check_true((select count(*)=0 from public.care_members),'outsider roster isolation');
do $$begin
  begin perform public.care_command('availability',jsonb_build_object('facility_id',(select value->>'facility_id' from qa_values where label='workspace'),'available',true));raise exception 'access unexpectedly granted';
  exception when insufficient_privilege then null;end;
end;$$;
-- Direct table writes bypassing the command API are denied even to members.
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from qa_ids where label='caregiver'),'role','authenticated')::text,true);
do $$begin
  begin update public.care_incidents set phase='resolved';raise exception 'write unexpectedly granted';exception when insufficient_privilege then null;end;
  begin perform public.care_command('arrive',jsonb_build_object('facility_id',(select value->>'facility_id' from qa_values where label='workspace'),'id',(select id from qa_ids where label='incident'),'request_id',(select id from qa_ids where label='arrival'),'version',0));raise exception 'arrival unexpectedly allowed';exception when others then if sqlerrm not like 'Only the assigned caregiver%' then raise;end if;end;
end;$$;
insert into qa_values values('claimed',public.care_command('acknowledge',jsonb_build_object('facility_id',(select value->>'facility_id' from qa_values where label='workspace'),'id',(select id from qa_ids where label='incident'),'request_id',(select id from qa_ids where label='claim'),'version',0)));
select pg_temp.check_true((select value->>'phase'='acknowledged' and (value->>'version')::integer=1 from qa_values where label='claimed'),'claim committed');
-- A duplicate request is idempotent, not a second transition or duplicate event.
select public.care_command('acknowledge',jsonb_build_object('facility_id',(select value->>'facility_id' from qa_values where label='workspace'),'id',(select id from qa_ids where label='incident'),'request_id',(select id from qa_ids where label='claim'),'version',0));
select pg_temp.check_true((select count(*)=2 from public.care_incident_events),'claim retry is idempotent');
do $$begin
  begin perform public.care_command('arrive',jsonb_build_object('facility_id',(select value->>'facility_id' from qa_values where label='workspace'),'id',(select id from qa_ids where label='incident'),'request_id',(select id from qa_ids where label='arrival'),'version',0));raise exception 'stale write unexpectedly allowed';exception when serialization_failure then null;end;
end;$$;
-- Server-side deadline escalation; no browser or provider is involved.
reset role;
update public.care_incidents set due_at=now()-interval '1 second' where id=(select id from qa_ids where label='incident');
select pg_temp.check_true(panoramic_private.escalate_due()=1,'one due response escalated');
select pg_temp.check_true(panoramic_private.escalate_due()=0,'escalation is idempotent');
set local role authenticated;
select public.care_command('arrive',jsonb_build_object('facility_id',(select value->>'facility_id' from qa_values where label='workspace'),'id',(select id from qa_ids where label='incident'),'request_id',(select id from qa_ids where label='arrival'),'version',2));
select public.care_command('resolve',jsonb_build_object('facility_id',(select value->>'facility_id' from qa_values where label='workspace'),'id',(select id from qa_ids where label='incident'),'request_id',(select id from qa_ids where label='resolve'),'version',3,'note','Verified the test workflow; no resident or real incident involved.'));
select pg_temp.check_true((select phase='resolved' and version=4 and escalated_at is null from public.care_incidents where id=(select id from qa_ids where label='incident')),'resolution persisted');
select pg_temp.check_true((select count(*)=5 from public.care_incident_events),'complete immutable event history');
select pg_temp.check_true((select not available from public.care_members where user_id=(select id from qa_ids where label='caregiver')),'resolution does not automatically claim caregiver availability');
rollback;
select 'PASS: team isolation, member write restrictions, legal transitions, idempotency, stale-write rejection, escalation and resolution; fixtures rolled back' as result;
