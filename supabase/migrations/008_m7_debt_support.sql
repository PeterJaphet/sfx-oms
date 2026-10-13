-- M7: one-time opening markers, debt validation/previews, reads and retries.
-- No existing RLS policy or role guard is weakened; zero ledger entries stay forbidden.
begin;
create table account_openings (
 account_id smallint primary key references accounts(id),amount numeric(14,2) not null,
 rate_to_try numeric(18,6),ledger_entry_id bigint unique references ledger_entries(id),
 reason text not null,created_by uuid not null references profiles(id),created_at timestamptz not null default now(),
 business_date date not null default business_date()
);
alter table account_openings enable row level security;
revoke all on account_openings from public,anon,authenticated;
create trigger no_delete before delete on account_openings for each row execute function trg_no_delete();
create trigger immutable before update on account_openings for each row execute function trg_ledger_immutable();
-- Preserve existing opening history, including reversed entries: once still means once.
insert into account_openings(account_id,amount,rate_to_try,ledger_entry_id,reason,created_by,created_at,business_date)
select distinct on (account_id) account_id,amount,rate_to_try,id,coalesce(note,'Existing opening balance'),created_by,created_at,business_date
from ledger_entries where entry_type='opening_balance' order by account_id,id;

create or replace function adjust_balance(p_account smallint,p_amount numeric,p_reason text,p_opening boolean default false,p_rate numeric default null)
returns bigint language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); eid bigint; acct accounts; rate numeric;
begin
 if not (coalesce(p_opening,false) and p_amount=0) then perform m5_amount(p_amount,false); end if;
 if p_rate is not null then perform m5_rate(p_rate); end if;
 select * into acct from accounts where id=p_account and is_active for update;
 if acct.id is null then raise exception 'Choose an active account'; end if;
 if coalesce(length(trim(p_reason)),0)<3 then raise exception 'A reason is required'; end if;
 if p_opening and (exists(select 1 from account_openings where account_id=p_account) or exists(select 1 from ledger_entries where account_id=p_account and entry_type='opening_balance')) then raise exception 'This account already has an opening balance; use an adjustment instead'; end if;
 if p_amount=0 then
  rate:=case when acct.currency='TRY' then 1 else coalesce(p_rate,(select rate_to_try from fx_rates where currency=acct.currency order by effective_date desc,id desc limit 1)) end;
 else
  rate:=resolve_rate(p_account,p_rate);
  eid:=post_entry(p_account,case when p_opening then 'opening_balance' else 'adjustment' end::entry_type,p_amount,rate,p_note=>p_reason);
 end if;
 if p_opening then insert into account_openings(account_id,amount,rate_to_try,ledger_entry_id,reason,created_by)values(p_account,p_amount,rate,eid,trim(p_reason),uid); end if;
 perform log_activity('account.adjust','accounts',p_account::text,jsonb_build_object('amount',p_amount,'reason',p_reason,'opening',p_opening));
 return eid;
end $$;

create function quote_opening(p jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); acct accounts; amt numeric:=(p->>'amount')::numeric; rate numeric; bal numeric; q jsonb;
begin
 if amt<>0 or amt is null then perform m5_amount(amt,false); end if;
 if nullif(p->>'rate','') is not null then perform m5_rate((p->>'rate')::numeric); end if;
 if coalesce(length(trim(p->>'reason')),0)<3 then raise exception 'A reason is required'; end if;
 select * into acct from accounts where id=(p->>'account_id')::smallint and is_active;
 if acct.id is null then raise exception 'Choose an active account'; end if;
 if exists(select 1 from account_openings where account_id=acct.id) then raise exception 'This account already has an opening balance; use an adjustment instead'; end if;
 if amt=0 then rate:=case when acct.currency='TRY' then 1 else coalesce(nullif(p->>'rate','')::numeric,(select rate_to_try from fx_rates where currency=acct.currency order by effective_date desc,id desc limit 1)) end;
 else rate:=resolve_rate(acct.id,nullif(p->>'rate','')::numeric); end if;
 bal:=account_balance(acct.id);
 q:=jsonb_build_object('business_date',public.business_date(),'currency',acct.currency,'amount',round(amt,2),'amount_try',case when amt=0 then 0 else round(amt*rate,2) end,'rate_to_try',round(rate,6),'balance_before',bal,'balance_after',bal+amt);
 return q||jsonb_build_object('quote_token',encode(sha256(convert_to(q::text,'UTF8')),'hex'));
end $$;

create function get_setup_accounts() returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); result jsonb;
begin
 select jsonb_build_object('business_date',public.business_date(),'accounts',coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order,t.id),'[]'),
 'balance_try_estimate',sum(t.balance_try_estimate),'missing_rates',count(*) filter(where t.balance_try_estimate is null),
 'complete',coalesce(bool_and(t.opened),false)) into result from (
 select a.*,b.balance,b.balance_try_estimate,(o.account_id is not null) as opened,o.amount as opening_amount,o.business_date as opening_date
 from accounts a join v_account_balances b on b.id=a.id left join account_openings o on o.account_id=a.id where a.is_active
 )t;
 return result;
end $$;
create or replace function record_debt(
  p_direction debt_direction, p_counterparty text, p_description text, p_amount numeric,
  p_currency text default 'TRY', p_due_date date default null, p_opening boolean default false,
  p_account smallint default null, p_rate numeric default null
) returns debts language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin'); d debts; cur text; rate numeric;
begin
  perform m5_amount(p_amount);
  if p_direction is null then raise exception 'Choose a debt direction'; end if;
  if upper(p_currency) not in ('TRY','USD','NGN') or p_currency is null then raise exception 'Choose TRY, USD or NGN'; end if;
  if p_rate is not null then perform m5_rate(p_rate); end if;
  if p_account is not null then perform 1 from accounts where id=p_account for update; end if;
  if coalesce(length(trim(p_counterparty)), 0) < 2 then raise exception 'Who is the debt with?'; end if;
  if coalesce(length(trim(p_description)), 0) < 3 then raise exception 'Describe the debt'; end if;
  if p_opening and p_account is not null then raise exception 'Opening debts move no money; leave the account empty'; end if;
  if p_account is not null then
    select currency into cur from accounts where id = p_account and is_active;
    if cur is distinct from upper(p_currency) then
      raise exception 'A loan must be in the currency of the account it moves through (%)', cur;
    end if;
    if p_direction = 'owed_to_us' and account_balance(p_account) < p_amount then
      raise exception 'Not enough money in this account';
    end if;
  end if;

  insert into debts (direction, counterparty, description, currency, amount, due_date, is_opening, source, created_by)
  values (p_direction, trim(p_counterparty), trim(p_description), upper(p_currency), p_amount, p_due_date, p_opening,
          case when p_opening then 'opening' when p_account is not null then 'loan' else 'manual' end, uid)
  returning * into d;

  if p_account is not null then
    rate := resolve_rate(p_account, p_rate);
    perform post_entry(p_account, case when p_direction = 'we_owe' then 'debt_in' else 'debt_out' end::entry_type,
                       case when p_direction = 'we_owe' then p_amount else -p_amount end, rate,
                       p_debt => d.id, p_note => 'Loan: ' || d.counterparty);
  end if;
  perform log_activity('debt.create', 'debts', d.id::text,
    jsonb_build_object('direction', p_direction, 'counterparty', d.counterparty, 'amount', p_amount, 'currency', d.currency, 'opening', p_opening));
  return d;
end $$;

create function quote_record_debt(p jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); amt numeric:=(p->>'amount')::numeric; rate numeric; acct accounts; cur text:=upper(p->>'currency'); dir debt_direction:=(p->>'direction')::debt_direction; bal numeric; q jsonb;
begin
 perform m5_amount(amt);
 if dir is null then raise exception 'Choose a debt direction'; end if;
 if cur not in ('TRY','USD','NGN') or cur is null then raise exception 'Choose TRY, USD or NGN'; end if;
 if coalesce(length(trim(p->>'counterparty')),0)<2 then raise exception 'Who is the debt with?'; end if;
 if coalesce(length(trim(p->>'description')),0)<3 then raise exception 'Describe the debt'; end if;
 if nullif(p->>'due_date','') is not null then perform (p->>'due_date')::date; end if;
 if nullif(p->>'rate','') is not null then perform m5_rate((p->>'rate')::numeric); end if;
 if coalesce((p->>'opening')::boolean,false) and p->>'account_id' is not null then raise exception 'Opening debts move no money; leave the account empty'; end if;
 if p->>'account_id' is not null then
  select * into acct from accounts where id=(p->>'account_id')::smallint and is_active;
  if acct.id is null then raise exception 'Choose an active account'; end if;
  if acct.currency<>cur then raise exception 'A loan must be in the currency of the account it moves through (%)',acct.currency; end if;
  bal:=account_balance(acct.id);rate:=resolve_rate(acct.id,nullif(p->>'rate','')::numeric);
  if dir='owed_to_us' and bal<amt then raise exception 'Not enough money in this account (balance %)',bal; end if;
 else rate:=case when cur='TRY' then 1 else(select rate_to_try from fx_rates where currency=cur order by effective_date desc,id desc limit 1) end; end if;
 q:=jsonb_build_object('business_date',public.business_date(),'currency',cur,'amount',round(amt,2),'amount_try',round(amt*rate,2),'rate_to_try',round(rate,6),
 'moves_money',acct.id is not null,'balance_before',bal,'balance_after',case when bal is not null then bal+case when dir='we_owe' then amt else -amt end end);
 return q||jsonb_build_object('quote_token',encode(sha256(convert_to(q::text,'UTF8')),'hex'));
end $$;

create function quote_debt_settlement(p jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); d record; acct accounts; amt numeric:=(p->>'amount')::numeric; covers numeric; rate numeric; bal numeric; s settings; q jsonb;
begin
 perform m5_amount(amt);
 if nullif(p->>'covers','') is not null then perform m5_amount((p->>'covers')::numeric); end if;
 select * into d from v_debts where id=(p->>'debt_id')::uuid;
 if d.id is null then raise exception 'Debt not found'; end if;
 if d.state<>'open' then raise exception 'This debt is already %',d.state; end if;
 select * into acct from accounts where id=(p->>'account_id')::smallint and is_active;
 if acct.id is null then raise exception 'Unknown account'; end if;
 if acct.currency=d.currency then covers:=amt;
 elsif nullif(p->>'covers','') is null then raise exception 'Say how much of the % debt this clears',d.currency;
 else covers:=(p->>'covers')::numeric; end if;
 if covers>d.outstanding then raise exception 'That is more than the % % still outstanding',d.outstanding,d.currency; end if;
 rate:=resolve_rate(acct.id,null);bal:=account_balance(acct.id);select * into s from settings;
 if d.direction='we_owe' then
  if bal<amt then raise exception 'Not enough money in this account (balance %)',bal; end if;
  if app_role()<>'admin' and s.withdrawal_approval_limit_try is not null and round(amt*rate,2)>s.withdrawal_approval_limit_try then raise exception 'Payments over ₺% need Admin',s.withdrawal_approval_limit_try; end if;
 end if;
 q:=jsonb_build_object('business_date',public.business_date(),'direction',d.direction,'currency',acct.currency,'debt_currency',d.currency,'amount',round(amt,2),'covers',round(covers,2),'amount_try',round(amt*rate,2),'rate_to_try',round(rate,6),'outstanding_before',d.outstanding,'outstanding_after',d.outstanding-covers,'balance_before',bal,'balance_after',bal+case when d.direction='we_owe' then -amt else amt end);
 return q||jsonb_build_object('quote_token',encode(sha256(convert_to(q::text,'UTF8')),'hex'));
end $$;
create or replace function settle_debt(p_debt uuid, p_account smallint, p_amount numeric,
                                       p_covers numeric default null, p_note text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('operations', 'admin');
  d record; acur text; rate numeric; covers numeric; s settings; eid bigint; preview jsonb;
begin
  perform 1 from debts where id=p_debt for update;
  perform 1 from accounts where id=p_account for update;
  preview:=quote_debt_settlement(jsonb_build_object('debt_id',p_debt,'account_id',p_account,'amount',p_amount,'covers',p_covers));
  select * into d from v_debts where id = p_debt;
  if d.id is null then raise exception 'Debt not found'; end if;
  if d.state <> 'open' then raise exception 'This debt is already %', d.state; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than 0'; end if;

  select currency into acur from accounts where id = p_account and is_active;
  if acur is null then raise exception 'Unknown account'; end if;
  if acur = d.currency then
    covers := p_amount;
  elsif p_covers is null or p_covers <= 0 then
    raise exception 'Say how much of the % debt this clears', d.currency;
  else
    covers := p_covers;
  end if;
  if covers > d.outstanding + 0.005 then
    raise exception 'That is more than the % % still outstanding', d.outstanding, d.currency;
  end if;

  rate := (preview->>'rate_to_try')::numeric;
  if d.direction = 'we_owe' then
    if account_balance(p_account) < p_amount then raise exception 'Not enough money in this account'; end if;
    select * into s from settings;
    if app_role() <> 'admin' and s.withdrawal_approval_limit_try is not null
       and round(p_amount * rate, 2) > s.withdrawal_approval_limit_try then
      raise exception 'Payments over ₺% need Admin', s.withdrawal_approval_limit_try;
    end if;
  end if;

  eid := post_entry(p_account, case when d.direction = 'we_owe' then 'debt_out' else 'debt_in' end::entry_type,
                    case when d.direction = 'we_owe' then -p_amount else p_amount end, rate,
                    p_debt => p_debt, p_note => coalesce(p_note, d.counterparty));
  insert into debt_settlements (debt_id, ledger_entry_id, covers) values (p_debt, eid, covers);
  perform log_activity(case when d.direction = 'we_owe' then 'debt.pay' else 'debt.collect' end, 'debts', p_debt::text,
    jsonb_build_object('account', p_account, 'amount', p_amount, 'covers', covers));
  return eid;
end $$;

create or replace function cancel_debt(p_debt uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); d debts;
begin
 if coalesce(length(trim(p_reason)),0)<3 then raise exception 'A reason is required'; end if;
 select * into d from debts where id=p_debt for update;
 if d.id is null then raise exception 'Debt not found'; end if;
 if d.is_cancelled then raise exception 'This debt is already cancelled'; end if;
 update debts set is_cancelled=true,cancel_reason=trim(p_reason) where id=p_debt;
 perform log_activity('debt.cancel','debts',p_debt::text,jsonb_build_object('reason',p_reason));
end $$;

create function debt_summary() returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); owe numeric; owed numeric; unpaid numeric; missing_owe int; missing_owed int;
begin
 select coalesce(sum(outstanding_try_estimate)filter(where direction='we_owe'),0),coalesce(sum(outstanding_try_estimate)filter(where direction='owed_to_us'),0),count(*)filter(where direction='we_owe' and outstanding_try_estimate is null),count(*)filter(where direction='owed_to_us' and outstanding_try_estimate is null)
 into owe,owed,missing_owe,missing_owed from v_debts where state='open';
 select coalesce(sum(balance_due),0) into unpaid from v_order_payments where status<>'cancelled' and balance_due>0;
 return jsonb_build_object('we_owe',owe,'owed_to_us',owed+unpaid,'debt_owed_to_us',owed,'customer_due',unpaid,'missing_owe_rates',missing_owe,'missing_owed_rates',missing_owed);
end $$;
create function list_debts(p_state text default 'open',p_direction text default 'all',p_offset int default 0,p_id uuid default null,p_search text default '')returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); result jsonb;
begin
 if p_state not in ('open','settled','cancelled','all') or p_direction not in ('we_owe','owed_to_us','all') or p_offset<0 or p_offset is null then raise exception 'Choose a valid debt view'; end if;
 select coalesce(jsonb_agg(t),'[]') into result from(select v.*,d.cancel_reason from v_debts v join debts d on d.id=v.id where (p_state='all' or v.state=p_state) and(p_direction='all' or v.direction::text=p_direction) and(p_id is null or v.id=p_id) and(v.counterparty ilike '%'||coalesce(p_search,'')||'%' or v.description ilike '%'||coalesce(p_search,'')||'%') order by case when v.state='open' then 0 else 1 end,v.is_overdue desc,v.due_date nulls last,v.business_date desc,v.id limit 50 offset p_offset)t;
 return result;
end $$;
create function list_unpaid_customers(p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); result jsonb;
begin
 if p_offset<0 or p_offset is null then raise exception 'Choose a valid page'; end if;
 select coalesce(jsonb_agg(t),'[]') into result from(select o.id,o.business_date,o.daily_number,o.customer_name,o.customer_phone,v.total,v.paid_try,v.balance_due from v_order_payments v join orders o on o.id=v.id where v.status<>'cancelled' and v.balance_due>0 order by o.business_date,o.daily_number limit 50 offset p_offset)t;
 return result;
end $$;

create function run_debt_action(p_action text,p jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid; h text; prior money_requests; q jsonb; result jsonb; d debts; eid bigint;
begin
 if p_action='settle' then uid:=require_role('operations','admin'); else uid:=require_role('admin'); end if;
 if p_action not in ('opening','record','settle','cancel') or p_action is null then raise exception 'Unknown debt action'; end if;
 if p_request_id is null then raise exception 'A request id is required'; end if;
 h:=encode(sha256(convert_to(jsonb_build_array('debts',p_action,p)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('money:'||uid::text||':'||p_request_id::text,0));
 select * into prior from money_requests where actor_id=uid and request_id=p_request_id;
 if found then if prior.request_hash<>h then raise exception 'Money request id was already used with different details'; end if; return prior.result; end if;
 if p->>'debt_id' is not null then perform 1 from debts where id=(p->>'debt_id')::uuid for update; end if;
 if p->>'account_id' is not null then perform 1 from accounts where id=(p->>'account_id')::smallint for update; end if;
 if p_action='settle' then perform 1 from settings for share; end if;
 case p_action
 when 'opening' then q:=quote_opening(p);
 when 'record' then q:=quote_record_debt(p);
 when 'settle' then q:=quote_debt_settlement(p);
 else q:=null;
 end case;
 if p ? 'quote_token' and (p->>'quote_token') is distinct from (q->>'quote_token') then raise exception 'Balances or debt details changed; review the updated preview'; end if;
 case p_action
 when 'opening' then
  eid:=adjust_balance((p->>'account_id')::smallint,(p->>'amount')::numeric,p->>'reason',true,nullif(p->>'rate','')::numeric);
  result:=jsonb_build_object('action',p_action,'account_id',(p->>'account_id')::smallint,'amount',q->'amount','currency',q->>'currency');
 when 'record' then
  d:=record_debt((p->>'direction')::debt_direction,p->>'counterparty',p->>'description',(p->>'amount')::numeric,upper(p->>'currency'),nullif(p->>'due_date','')::date,coalesce((p->>'opening')::boolean,false),(p->>'account_id')::smallint,case when q->>'moves_money'='true' then(q->>'rate_to_try')::numeric else null end);
  result:=jsonb_build_object('action',p_action,'id',d.id,'amount',d.amount,'currency',d.currency);
 when 'settle' then
  eid:=settle_debt((p->>'debt_id')::uuid,(p->>'account_id')::smallint,(p->>'amount')::numeric,nullif(p->>'covers','')::numeric,p->>'note');
  result:=jsonb_build_object('action',p_action,'id',eid,'debt_id',p->>'debt_id','outstanding_after',q->'outstanding_after','currency',q->>'debt_currency');
 when 'cancel' then
  perform cancel_debt((p->>'debt_id')::uuid,p->>'reason');result:=jsonb_build_object('action',p_action,'id',p->>'debt_id');
 end case;
 insert into money_requests(actor_id,request_id,action,request_hash,result)values(uid,p_request_id,p_action,h,result);
 return result;
end $$;
revoke all on function quote_opening(jsonb) from public,anon;
grant execute on function quote_opening(jsonb) to authenticated;
revoke all on function get_setup_accounts() from public,anon;
grant execute on function get_setup_accounts() to authenticated;
revoke all on function quote_record_debt(jsonb) from public,anon;
grant execute on function quote_record_debt(jsonb) to authenticated;
revoke all on function quote_debt_settlement(jsonb) from public,anon;
grant execute on function quote_debt_settlement(jsonb) to authenticated;
revoke all on function debt_summary() from public,anon;
grant execute on function debt_summary() to authenticated;
revoke all on function list_debts(text,text,int,uuid,text) from public,anon;
grant execute on function list_debts(text,text,int,uuid,text) to authenticated;
revoke all on function list_unpaid_customers(int) from public,anon;
grant execute on function list_unpaid_customers(int) to authenticated;
revoke all on function run_debt_action(text,jsonb,uuid) from public,anon;
grant execute on function run_debt_action(text,jsonb,uuid) to authenticated;
commit;
