-- M8: consistent cash snapshots, recoverable close, and closed-day writes.
-- Additive only: existing signatures, role guards, RLS and deletion bans remain.
begin;
alter table day_closes add column details jsonb;
create trigger no_delete before delete on day_closes for each row execute function trg_no_delete();

-- Financial writers take this BEFORE row locks. Closing takes the exclusive
-- version, so it waits for every in-flight financial transaction to finish.
-- Locking alone permits confirmed request replays after a day has closed.
create function m8_lock_current_day() returns void
language sql volatile set search_path=public,pg_catalog as $$
 select pg_advisory_xact_lock_shared(hashtextextended('financial-day:'||public.business_date()::text,0));
$$;
revoke all on function m8_lock_current_day() from public,anon,authenticated;
do $$
declare f record; definition text; amended text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array[
 'create_order','add_order_payment','cancel_order','create_withdrawal','decide_withdrawal',
 'log_purchase','return_change','settle_advance_overspend','record_debt','settle_debt','cancel_debt',
 'transfer_between_accounts','adjust_balance','reverse_entry','reverse_purchase',
 'run_money_action','run_logistics_action','run_debt_action'])
 loop
  definition:=pg_get_functiondef(f.oid);
  amended:=regexp_replace(definition,'(\mbegin\M)',E'\\1\n perform public.m8_lock_current_day();','i');
  if amended=definition then raise exception 'Cannot add financial lock to %',f.oid::regprocedure; end if;
  execute amended;
 end loop;
end $$;

-- Invoker trigger: direct client writes still fail under the original RLS.
-- Inside guarded security-definer RPCs, enforce the affected financial day.
create function m8_guard_closed_day() returns trigger
language plpgsql set search_path=public,pg_catalog as $$
declare d date; data jsonb:=to_jsonb(new); who text:=app_role();
begin
 if current_user in ('authenticated','anon') then return new; end if;
 if tg_table_name='orders' and tg_op='UPDATE' then
  if (new.subtotal,new.total,new.discount_amount,new.discount_reason) is not distinct from
     (old.subtotal,old.total,old.discount_amount,old.discount_reason)
     and not(new.status='cancelled' and old.status<>'cancelled') then return new; end if;
 end if;
 d:=(data->>'business_date')::date;
 if tg_table_name='order_items' then select business_date into d from orders where id=new.order_id;
 elsif tg_table_name='purchase_items' then select business_date into d from purchases where id=new.purchase_id;
 elsif tg_table_name='debt_settlements' then select business_date into d from ledger_entries where id=new.ledger_entry_id;
 elsif tg_table_name='account_transfers' then d:=public.business_date(new.created_at); end if;
 if d is null then raise exception 'Financial day is required'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('financial-day:'||d::text,0));
 if exists(select 1 from day_closes where business_date=d and not superseded) then
  if who is not null and who<>'admin' then
   raise exception 'Business day % is closed; ask Admin to make financial changes',d;
  elsif who='admin' then
   perform log_activity('day.closed_write',tg_table_name,coalesce(data->>'id',data->>'account_id'),
    jsonb_build_object('operation',tg_op,'business_date',d));
  end if;
 end if;
 return new;
end $$;
revoke all on function m8_guard_closed_day() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['orders','order_items','ledger_entries','withdrawals','purchases','purchase_items','debts','debt_settlements','account_transfers','account_openings'] loop
  execute format('create trigger m8_closed_day before insert or update on %I for each row execute function m8_guard_closed_day()',t);
 end loop;
end $$;

create function m8_close_immutable() returns trigger language plpgsql as $$
begin
 if to_jsonb(new)-'superseded'-'difference' is distinct from to_jsonb(old)-'superseded'-'difference'
 or old.superseded or not new.superseded then raise exception 'Daily close snapshots are permanent; Admin can re-close instead'; end if;
 return new;
end $$;
revoke all on function m8_close_immutable() from public,anon,authenticated;
create trigger m8_immutable before update on day_closes for each row execute function m8_close_immutable();

create function financial_day_state() returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','logistics','admin'); d date:=public.business_date();
begin
 return jsonb_build_object('business_date',d,'closed',exists(select 1 from day_closes where business_date=d and not superseded));
end $$;

create function get_close_context(p_date date default null,p_account smallint default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); d date:=coalesce(p_date,public.business_date());
 acct accounts; lines jsonb; unpaid jsonb; advances jsonb; current_id bigint;
begin
 if d>public.business_date() then raise exception 'Cannot close a future business day'; end if;
 select * into acct from accounts where id=coalesce(p_account,(select id from accounts where is_cash order by sort_order,id limit 1));
 if acct.id is null or not acct.is_active then raise exception 'Choose an active account'; end if;
 select coalesce(jsonb_agg(t order by t.entry_type),'[]') into lines from (
  select entry_type,sum(amount) as amount from ledger_entries where account_id=acct.id and business_date=d group by entry_type)t;
 select coalesce(jsonb_agg(t order by t.daily_number,t.id),'[]') into unpaid from (
  select v.id,v.business_date,v.daily_number,o.customer_name,v.balance_due from v_order_payments v join orders o on o.id=v.id
  where v.business_date=d and v.status<>'cancelled' and v.balance_due>0)t;
 select coalesce(jsonb_agg(t order by t.business_date,t.id),'[]') into advances from (
  select v.id,v.business_date,v.recipient_name,v.purpose,v.remaining,v.state,a.currency
  from v_advances v join accounts a on a.id=v.account_id where v.state in ('open','owed_to_staff'))t;
 select id into current_id from day_closes where business_date=d and account_id=acct.id and not superseded;
 return jsonb_build_object('business_date',d,'current_business_date',public.business_date(),
 'account_id',acct.id,'account_name',acct.name,'currency',acct.currency,
 'opening',expected_cash(d-1,acct.id),'lines',lines,'expected',expected_cash(d,acct.id),
 'unpaid_orders',unpaid,'advances',advances,'current_close_id',current_id,
 'can_close',app_role()='admin' or (d=public.business_date() and current_id is null));
end $$;

create function quote_close(p jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); counted numeric:=(p->>'counted')::numeric; q jsonb;
begin
 if counted is null or counted::text in ('NaN','Infinity','-Infinity') or counted<0 or counted<>round(counted,2) or counted>999999999999.99 then raise exception 'Counted cash must be 0 or more, with at most 2 decimals'; end if;
 q:=get_close_context(nullif(p->>'date','')::date,(p->>'account_id')::smallint);
 q:=q||jsonb_build_object('counted',counted,'difference',counted-(q->>'expected')::numeric);
 return q||jsonb_build_object('quote_token',encode(sha256(convert_to(q::text,'UTF8')),'hex'));
end $$;

create or replace function close_day(p_counted numeric,p_note text default null,
 p_date date default business_date(),p_account smallint default null)
returns day_closes language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); q jsonb; c day_closes;
begin
 if p_date is null then raise exception 'Choose a business day'; end if;
 perform pg_advisory_xact_lock(hashtextextended('financial-day:'||p_date::text,0));
 q:=quote_close(jsonb_build_object('counted',p_counted,'date',p_date,'account_id',p_account));
 if not (q->>'can_close')::boolean then
  if q->>'current_close_id' is not null then raise exception 'This day is already closed; ask Admin to re-close';
  else raise exception 'Only Admin can close a past business day'; end if;
 end if;
 update day_closes set superseded=true where business_date=p_date and account_id=(q->>'account_id')::smallint and not superseded;
 insert into day_closes(business_date,account_id,expected_amount,counted_amount,unpaid_orders,open_advances,note,closed_by,details)
 values(p_date,(q->>'account_id')::smallint,(q->>'expected')::numeric,p_counted,
 jsonb_array_length(q->'unpaid_orders'),(select count(*) from jsonb_array_elements(q->'advances')a where a->>'state'='open'),nullif(trim(p_note),''),uid,q-'quote_token') returning * into c;
 perform log_activity('day.close','day_closes',c.id::text,jsonb_build_object('date',p_date,'expected',c.expected_amount,'counted',p_counted,'difference',c.difference));
 return c;
end $$;

create function run_close(p jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); h text; prior money_requests; q jsonb; c day_closes; result jsonb; d date:=coalesce(nullif(p->>'date','')::date,public.business_date());
begin
 if p_request_id is null then raise exception 'A request id is required'; end if;
 h:=encode(sha256(convert_to(jsonb_build_array('close',p)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('money:'||uid::text||':'||p_request_id::text,0));
 select * into prior from money_requests where actor_id=uid and request_id=p_request_id;
 if found then if prior.request_hash<>h then raise exception 'Money request id was already used with different details'; end if; return prior.result; end if;
 perform pg_advisory_xact_lock(hashtextextended('financial-day:'||d::text,0));
 q:=quote_close(p);
 if p->>'quote_token' is null or (p->>'quote_token') is distinct from (q->>'quote_token') then raise exception 'Cash or close details changed; review the updated preview'; end if;
 c:=close_day((p->>'counted')::numeric,p->>'note',d,(p->>'account_id')::smallint);
 result:=to_jsonb(c);
 insert into money_requests(actor_id,request_id,action,request_hash,result)values(uid,p_request_id,'close',h,result);
 return result;
end $$;

create function list_day_closes(p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); result jsonb;
begin
 if p_offset<0 or p_offset is null then raise exception 'Choose a valid page'; end if;
 select coalesce(jsonb_agg(t),'[]') into result from (
  select c.*,a.name as account_name,a.currency,p.full_name as closed_by_name from day_closes c
  join accounts a on a.id=c.account_id join profiles p on p.id=c.closed_by
  order by c.business_date desc,c.closed_at desc,c.id desc limit 50 offset p_offset)t;
 return result;
end $$;
revoke all on function financial_day_state() from public,anon;
grant execute on function financial_day_state() to authenticated;
revoke all on function get_close_context(date,smallint) from public,anon;
grant execute on function get_close_context(date,smallint) to authenticated;
revoke all on function quote_close(jsonb) from public,anon;
grant execute on function quote_close(jsonb) to authenticated;
revoke all on function run_close(jsonb,uuid) from public,anon;
grant execute on function run_close(jsonb,uuid) to authenticated;
revoke all on function list_day_closes(int) from public,anon;
grant execute on function list_day_closes(int) to authenticated;
commit;
