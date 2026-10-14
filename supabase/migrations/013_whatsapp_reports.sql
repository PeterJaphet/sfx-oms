-- M15: private WhatsApp recipient configuration and report delivery outbox.
-- All monetary figures read canonical views/report_pnl; financial writes are unchanged.
begin;
create table whatsapp_settings (
 id boolean primary key default true check(id),
 sender_phone text not null default '+905391375702' check(sender_phone='+905391375702'),
 enabled boolean not null default false,
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(), updated_by uuid references profiles(id)
);
insert into whatsapp_settings default values;
create table whatsapp_recipients (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 80),
 phone text not null unique check(phone ~ '^\+[1-9][0-9]{7,14}$' and phone<>'+905391375702'),
 is_active boolean not null default false, daily boolean not null default true, weekly boolean not null default true,
 consent_at timestamptz, revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(), updated_by uuid not null references profiles(id),
 check(not is_active or consent_at is not null)
);
create table whatsapp_reports (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references whatsapp_recipients(id),
 phone text not null, kind text not null check(kind in('daily','weekly','test')),
 period_from date not null, period_to date not null check(period_to>=period_from),
 snapshot jsonb not null,
 status text not null default 'queued' check(status in('queued','sending','accepted','sent','delivered','read','failed','unknown','skipped')),
 message_id text unique, claim_token uuid, claimed_at timestamptz, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), error_code text, created_by uuid references profiles(id),
 client_request_id uuid unique
);
create unique index whatsapp_one_scheduled_report on whatsapp_reports(recipient_id,kind,period_from,period_to) where kind<>'test';
create table whatsapp_report_events (
 id bigint generated always as identity primary key, report_id uuid not null references whatsapp_reports(id),
 status text not null, message_id text, error_code text, occurred_at timestamptz not null default now(),
 unique(report_id,status,message_id)
);
do $$declare t text;begin
 foreach t in array array['whatsapp_settings','whatsapp_recipients','whatsapp_reports','whatsapp_report_events'] loop
  execute format('alter table %I enable row level security',t);
  execute format('create policy admin_read on %I for select to authenticated using(app_role()=''admin'')',t);
  execute format('create trigger no_delete before delete on %I for each row execute function trg_no_delete()',t);
 end loop;
end $$;
create function whatsapp_guard_history() returns trigger language plpgsql set search_path=public,pg_catalog as $$
begin
 if tg_table_name='whatsapp_report_events' or (to_jsonb(new)-array['status','message_id','claim_token','claimed_at','updated_at','error_code']) is distinct from (to_jsonb(old)-array['status','message_id','claim_token','claimed_at','updated_at','error_code']) then
  raise exception 'WhatsApp report snapshots and events cannot be changed';
 end if; return new;
end $$;
create trigger immutable_report before update on whatsapp_reports for each row execute function whatsapp_guard_history();
create trigger immutable_event before update on whatsapp_report_events for each row execute function whatsapp_guard_history();

create function get_whatsapp_settings() returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare actor uuid:=require_role('admin');begin
 return jsonb_build_object('settings',(select to_jsonb(s) from whatsapp_settings s),
 'recipients',(select coalesce(jsonb_agg(r order by r.name,r.id),'[]') from whatsapp_recipients r),
 'history',(select coalesce(jsonb_agg(x order by x.created_at desc,x.id),'[]') from(select r.id,r.recipient_id,r.phone,r.kind,r.period_from,r.period_to,r.status,r.created_at,r.updated_at,r.error_code,r.message_id,r.snapshot->>'generated_at' as generated_at from whatsapp_reports r order by r.created_at desc,r.id limit 100)x));
end $$;
create function save_whatsapp_recipient(p jsonb) returns whatsapp_recipients language plpgsql security definer set search_path=public,pg_catalog as $$
declare actor uuid:=require_role('admin'); r whatsapp_recipients; rid uuid:=(p->>'id')::uuid; active boolean:=(p->>'is_active')::boolean; consent boolean:=(p->>'consent')::boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('sfx.whatsapp.settings',0));
 if jsonb_typeof(p)<>'object' or jsonb_typeof(p->'name')<>'string' or jsonb_typeof(p->'phone')<>'string' or active is null or jsonb_typeof(p->'daily')<>'boolean' or jsonb_typeof(p->'weekly')<>'boolean' or consent is null then raise exception 'Complete the recipient details'; end if;
 if active and not consent then raise exception 'Confirm permission to receive reports';end if;
 if active and not ((p->>'daily')::boolean or (p->>'weekly')::boolean) then raise exception 'Choose daily or weekly reports';end if;
 if active and (select count(*) from whatsapp_recipients where is_active and id is distinct from rid)>=20 then raise exception 'Up to 20 active report recipients are allowed';end if;
 if rid is null then
  insert into whatsapp_recipients(name,phone,is_active,daily,weekly,consent_at,updated_by) values(trim(p->>'name'),trim(p->>'phone'),active,(p->>'daily')::boolean,(p->>'weekly')::boolean,case when consent then now() end,actor) returning * into r;
 else
  select * into r from whatsapp_recipients where id=rid for update;
  if not found then raise exception 'Recipient not found';end if;
  if (p->>'revision')::int is distinct from r.revision then raise exception 'Recipient changed; refresh before saving';end if;
  update whatsapp_recipients set name=trim(p->>'name'),phone=trim(p->>'phone'),is_active=active,daily=(p->>'daily')::boolean,weekly=(p->>'weekly')::boolean,
   consent_at=case when not consent then null when phone=trim(p->>'phone') then coalesce(consent_at,now()) else now() end,revision=revision+1,updated_at=now(),updated_by=actor where id=rid returning * into r;
 end if;
 perform log_activity('whatsapp.recipient.save','whatsapp_recipients',r.id::text,jsonb_build_object('active',r.is_active,'daily',r.daily,'weekly',r.weekly)); return r;
end $$;
create function set_whatsapp_enabled(p_enabled boolean,p_revision integer) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare actor uuid:=require_role('admin');begin
 perform pg_advisory_xact_lock(hashtextextended('sfx.whatsapp.settings',0));
 if p_enabled is null then raise exception 'Choose whether reports are enabled';end if;
 if p_enabled and not exists(select 1 from whatsapp_recipients where is_active and consent_at is not null and (daily or weekly)) then raise exception 'Add an active recipient first';end if;
 update whatsapp_settings set enabled=p_enabled,revision=revision+1,updated_at=now(),updated_by=actor where revision=p_revision;
 if not found then raise exception 'Report settings changed; refresh before saving';end if;
 perform log_activity('whatsapp.schedule.set','whatsapp_settings','true',jsonb_build_object('enabled',p_enabled));
end $$;
-- Internal snapshot builder: no client-provided totals or report-time overrides.
create function whatsapp_report_snapshot(p_kind text,p_from date,p_to date,p_now timestamptz) returns jsonb language sql stable security definer set search_path=public,pg_catalog as $$
 select jsonb_build_object('kind',p_kind,'from',p_from,'to',p_to,'generated_at',p_now,
 'generated_local',to_char(p_now at time zone 'Europe/Nicosia','YYYY-MM-DD HH24:MI'),
 'orders',(select coalesce(sum(orders),0) from v_sales_daily where business_date between p_from and p_to),
 'pnl',(select to_jsonb(p) from report_pnl(p_from,p_to)p),
 'unpaid_now',(select coalesce(sum(balance_due),0) from v_order_payments where status<>'cancelled' and balance_due>0));
$$;
-- Pure internal date resolver, tested across daylight-saving boundaries.
create function whatsapp_due_periods(p_now timestamptz) returns table(kind text,from_date date,to_date date) language sql stable set search_path=public,pg_catalog as $$
 with t as(select p_now at time zone 'Europe/Nicosia' as local_time)
 select 'daily',business_date(p_now),business_date(p_now) from t where local_time::time>='23:00' and local_time::time<'23:15'
 union all select 'weekly',date_trunc('week',business_date(p_now))::date-7,date_trunc('week',business_date(p_now))::date-1 from t where extract(isodow from local_time)=1 and local_time::time>='08:00' and local_time::time<'08:15';
$$;
create function whatsapp_prepare_at(p_now timestamptz) returns integer language plpgsql security definer set search_path=public,pg_catalog as $$
declare n integer:=0; added integer; d record; payload jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended('sfx.whatsapp.settings',0));
 if not (select enabled from whatsapp_settings) then return 0;end if;
 for d in select * from whatsapp_due_periods(p_now) loop
  payload:=whatsapp_report_snapshot(d.kind,d.from_date,d.to_date,p_now);
  insert into whatsapp_reports(recipient_id,phone,kind,period_from,period_to,snapshot)
   select id,phone,d.kind,d.from_date,d.to_date,payload from whatsapp_recipients where is_active and consent_at is not null and case when d.kind='daily' then daily else weekly end
  on conflict(recipient_id,kind,period_from,period_to) where kind<>'test' do nothing;
  get diagnostics added=row_count;n:=n+added;
 end loop;return n;
end $$;
create function prepare_whatsapp_reports() returns integer language sql security definer set search_path=public,pg_catalog as $$select whatsapp_prepare_at(now());$$;
create function queue_whatsapp_test(p_recipient uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare actor uuid:=require_role('admin'); r whatsapp_recipients; existing whatsapp_reports; rid uuid;begin
 if p_request is null then raise exception 'A test request ID is required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into existing from whatsapp_reports where client_request_id=p_request;
 if found then
  if existing.recipient_id<>p_recipient or existing.created_by<>actor then raise exception 'Test request ID was already used';end if;return existing.id;
 end if;
 select * into r from whatsapp_recipients where id=p_recipient for share;
 if not found or not r.is_active or r.consent_at is null then raise exception 'Choose an active recipient with permission';end if;
 insert into whatsapp_reports(recipient_id,phone,kind,period_from,period_to,snapshot,created_by,client_request_id)
 values(r.id,r.phone,'test',business_date(),business_date(),whatsapp_report_snapshot('test',business_date(),business_date(),now()),actor,p_request) returning id into rid;
 perform log_activity('whatsapp.test.queue','whatsapp_reports',rid::text);return rid;
end $$;
create function claim_whatsapp_report(p_test uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare r whatsapp_reports; recipient whatsapp_recipients;begin
 -- A crashed sender may have reached Meta: mark uncertain, never blindly retry.
 update whatsapp_reports set status='unknown',error_code='SENDER_INTERRUPTED',updated_at=now() where status='sending' and claimed_at<now()-interval '5 minutes';
 loop
  select * into r from whatsapp_reports where status='queued' and case when p_test is null then kind<>'test' else id=p_test and kind='test' end order by created_at,id limit 1 for update skip locked;
  if not found then return null;end if;
  select * into recipient from whatsapp_recipients where id=r.recipient_id for share;
  if not recipient.is_active or recipient.consent_at is null or recipient.phone<>r.phone or (r.kind<>'test' and (not (select enabled from whatsapp_settings) or not case when r.kind='daily' then recipient.daily else recipient.weekly end)) or r.created_at<now()-interval '30 minutes' then
   update whatsapp_reports set status='skipped',error_code='DISABLED_CHANGED_OR_EXPIRED',updated_at=now() where id=r.id;
   insert into whatsapp_report_events(report_id,status,error_code) values(r.id,'skipped','DISABLED_CHANGED_OR_EXPIRED');continue;
  end if;
  update whatsapp_reports set status='sending',claim_token=gen_random_uuid(),claimed_at=now(),updated_at=now() where id=r.id returning * into r;
  insert into whatsapp_report_events(report_id,status) values(r.id,'sending');return to_jsonb(r);
 end loop;
end $$;
create function finish_whatsapp_report(p_report uuid,p_claim uuid,p_status text,p_message text default null,p_error text default null) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare r whatsapp_reports;begin
 if p_status not in('accepted','failed','unknown') or p_status is null or (p_status='accepted' and coalesce(length(p_message),0) not between 1 and 512) then raise exception 'Invalid report send result';end if;
 select * into r from whatsapp_reports where id=p_report for update;
 if not found or r.claim_token is distinct from p_claim or p_claim is null then raise exception 'Invalid report claim';end if;
 if r.status not in('sending','unknown') then return;end if;
 update whatsapp_reports set status=p_status,message_id=coalesce(p_message,message_id),error_code=left(p_error,80),updated_at=now() where id=r.id;
 insert into whatsapp_report_events(report_id,status,message_id,error_code) values(r.id,p_status,p_message,left(p_error,80)) on conflict do nothing;
end $$;
create function record_whatsapp_status(p_report uuid,p_message text,p_phone text,p_status text,p_at timestamptz,p_error text default null) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare r whatsapp_reports; next_rank integer; old_rank integer;begin
 if p_status not in('sent','delivered','read','failed') or p_status is null or coalesce(length(p_message),0) not between 1 and 512 or p_at is null then raise exception 'Invalid WhatsApp status';end if;
 select * into r from whatsapp_reports where (id=p_report or message_id=p_message) and phone='+'||p_phone for update;
 if not found or r.status in('queued','skipped') or (r.message_id is not null and r.message_id<>p_message) then return;end if;
 insert into whatsapp_report_events(report_id,status,message_id,error_code,occurred_at) values(r.id,p_status,p_message,left(p_error,80),p_at) on conflict do nothing;
 old_rank:=case r.status when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 when 'accepted' then 1 else 0 end;
 next_rank:=case p_status when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 else 0 end;
 if next_rank>old_rank or (p_status='failed' and old_rank<3) then
  update whatsapp_reports set status=p_status,message_id=p_message,error_code=case when p_status='failed' then left(p_error,80) end,updated_at=now() where id=r.id;
 end if;
end $$;
revoke all on whatsapp_settings,whatsapp_recipients,whatsapp_reports,whatsapp_report_events from public,anon,authenticated;
grant select on whatsapp_settings,whatsapp_recipients,whatsapp_reports,whatsapp_report_events to authenticated;
-- Functions below are granted individually. Service-only entry points grant no client access.
revoke all on function whatsapp_guard_history(),get_whatsapp_settings(),save_whatsapp_recipient(jsonb),set_whatsapp_enabled(boolean,integer),whatsapp_report_snapshot(text,date,date,timestamptz),whatsapp_due_periods(timestamptz),whatsapp_prepare_at(timestamptz),prepare_whatsapp_reports(),queue_whatsapp_test(uuid,uuid),claim_whatsapp_report(uuid),finish_whatsapp_report(uuid,uuid,text,text,text),record_whatsapp_status(uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function get_whatsapp_settings(),save_whatsapp_recipient(jsonb),set_whatsapp_enabled(boolean,integer),queue_whatsapp_test(uuid,uuid) to authenticated;
grant execute on function prepare_whatsapp_reports(),claim_whatsapp_report(uuid),finish_whatsapp_report(uuid,uuid,text,text,text),record_whatsapp_status(uuid,text,text,text,timestamptz,text) to service_role;
commit;
