begin;
-- Counts entered at go-live are balance snapshots, not additional receipts.
create table go_live_balance_receipts(
 account_id smallint primary key references account_openings(account_id),
 details jsonb not null, applied_by uuid not null references profiles(id), applied_at timestamptz not null default now()
);
create table go_live_setup_runs(
 preview_token text primary key, result jsonb not null,
 applied_by uuid not null references profiles(id), applied_at timestamptz not null default now()
);
alter table go_live_balance_receipts enable row level security;
alter table go_live_setup_runs enable row level security;
revoke all on go_live_balance_receipts,go_live_setup_runs from public,anon,authenticated;
create trigger no_delete before delete on go_live_balance_receipts for each row execute function trg_no_delete();
create trigger immutable before update on go_live_balance_receipts for each row execute function trg_ledger_immutable();
create trigger no_delete before delete on go_live_setup_runs for each row execute function trg_no_delete();
create trigger immutable before update on go_live_setup_runs for each row execute function trg_ledger_immutable();

-- Preserve original non-opening adjustment behavior and all day/role guards.
create or replace function adjust_balance(p_account smallint,p_amount numeric,p_reason text,p_opening boolean default false,p_rate numeric default null)
returns bigint language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); eid bigint; acct accounts; rate numeric; delta numeric; before_balance numeric;
begin
 perform public.m8_lock_current_day();
 if p_opening then perform pg_advisory_xact_lock(hashtextextended('sfx-go-live-balances',0));end if;
 if not (coalesce(p_opening,false) and p_amount=0) then perform m5_amount(p_amount,false);end if;
 if p_rate is not null then perform m5_rate(p_rate);end if;
 select * into acct from accounts where id=p_account and is_active for update;
 if acct.id is null then raise exception 'Choose an active account';end if;
 if coalesce(length(trim(p_reason)),0)<3 then raise exception 'A reason is required';end if;
 if p_opening and (exists(select 1 from account_openings where account_id=p_account) or exists(select 1 from ledger_entries where account_id=p_account and entry_type='opening_balance')) then
  raise exception 'This account already has an opening balance; use an adjustment instead';
 end if;
 before_balance:=account_balance(p_account);
 delta:=case when p_opening then p_amount-before_balance else p_amount end;
 if delta<>0 then
  rate:=resolve_rate(p_account,p_rate);
  perform m5_amount(delta,false);
  eid:=post_entry(p_account,case when p_opening then 'opening_balance' else 'adjustment' end::entry_type,delta,rate,p_note=>p_reason);
 else
  rate:=case when acct.currency='TRY' then 1 else coalesce(p_rate,(select rate_to_try from fx_rates where currency=acct.currency order by effective_date desc,id desc limit 1)) end;
 end if;
 if p_opening and p_amount<>0 and rate is null then raise exception 'No exchange rate for %; set one first',acct.currency;end if;
 if p_opening then
  insert into account_openings(account_id,amount,rate_to_try,ledger_entry_id,reason,created_by)values(p_account,p_amount,rate,eid,trim(p_reason),uid);
  insert into go_live_balance_receipts(account_id,details,applied_by)values(p_account,
   jsonb_build_object('mode','snapshot_on_entry','counted_balance',p_amount,'balance_before',before_balance,'ledger_delta',delta,'ledger_entry_id',eid),uid);
 end if;
 perform log_activity('account.adjust','accounts',p_account::text,jsonb_build_object('amount',p_amount,'ledger_delta',delta,'reason',p_reason,'opening',p_opening));
 return eid;
end $$;

create or replace function quote_opening(p jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); acct accounts; amt numeric:=(p->>'amount')::numeric; rate numeric; bal numeric; q jsonb; delta numeric;
begin
 if amt<>0 or amt is null then perform m5_amount(amt,false);end if;
 if nullif(p->>'rate','') is not null then perform m5_rate((p->>'rate')::numeric);end if;
 if coalesce(length(trim(p->>'reason')),0)<3 then raise exception 'A reason is required';end if;
 select * into acct from accounts where id=(p->>'account_id')::smallint and is_active;
 if acct.id is null then raise exception 'Choose an active account';end if;
 if exists(select 1 from account_openings where account_id=acct.id) then raise exception 'This account already has an opening balance; use an adjustment instead';end if;
 bal:=account_balance(acct.id);delta:=amt-bal;
 if delta=0 then rate:=case when acct.currency='TRY' then 1 else coalesce(nullif(p->>'rate','')::numeric,(select rate_to_try from fx_rates where currency=acct.currency order by effective_date desc,id desc limit 1)) end;
 else rate:=resolve_rate(acct.id,nullif(p->>'rate','')::numeric);end if;
 if amt<>0 and rate is null then raise exception 'No exchange rate for %; set one first',acct.currency;end if;
 q:=jsonb_build_object('business_date',public.business_date(),'currency',acct.currency,'amount',round(amt,2),
 'amount_try',case when amt=0 then 0 else round(amt*rate,2) end,'rate_to_try',round(rate,6),
 'balance_before',bal,'balance_after',amt,'ledger_delta',delta);
 return q||jsonb_build_object('quote_token',encode(sha256(convert_to(q::text,'UTF8')),'hex'));
end $$;

create function reconcile_go_live_balances(p_apply boolean default false,p_token text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); a accounts; o account_openings; row jsonb; rows jsonb:='[]'; retire jsonb:='[]';
 before_opening numeric; delta numeric; current_balance numeric; rate numeric; eid bigint; pending int; token text; result jsonb; prior jsonb;
 d date; redot accounts; new_id smallint; done boolean; row_count int:=0;
begin
 if coalesce(p_apply,false) then
  select r.result into prior from go_live_setup_runs r where preview_token=p_token;
  if found then return prior||jsonb_build_object('already_applied',true);end if;
 end if;
 perform public.m8_lock_current_day();
 perform pg_advisory_xact_lock(hashtextextended('sfx-go-live-balances',0));
 -- Dates before account locks, consistent with day close.
 for d in select distinct business_date from account_openings order by business_date loop
  perform pg_advisory_xact_lock_shared(hashtextextended('financial-day:'||d::text,0));
 end loop;
 perform 1 from accounts order by id for update;
 for a in select * from accounts where is_active order by sort_order,id loop
  current_balance:=account_balance(a.id);
  if lower(a.name)='crypto' or (lower(a.name) like 'sfx%' and lower(a.name) like '%legacy%')
   or (lower(a.name) like 'redot%' and a.currency<>'TRY') then
   select (select count(*)from orders where status not in('completed','cancelled') and (settlement->>'account_id')::int=a.id)
    +(select count(*)from withdrawals where account_id=a.id and status='pending_approval')
    +(select count(*)from v_advances where account_id=a.id and state in('open','owed_to_staff')) into pending;
   retire:=retire||jsonb_build_array(jsonb_build_object('id',a.id,'name',a.name,'currency',a.currency,'balance',current_balance,'pending',pending));
   continue;
  end if;
  select * into o from account_openings where account_id=a.id;
  if not found then continue;end if;
  done:=exists(select 1 from go_live_balance_receipts where account_id=a.id);
  delta:=0;
  if not done then
   if o.ledger_entry_id is not null then
    if exists(select 1 from ledger_entries where reverses_id=o.ledger_entry_id) then raise exception 'Opening for % was reversed; review it before reconciliation',a.name;end if;
    select coalesce(sum(amount),0) into before_opening from ledger_entries where account_id=a.id and id<o.ledger_entry_id;
   else
    select coalesce(sum(amount),0) into before_opening from ledger_entries where account_id=a.id and created_at<=o.created_at;
   end if;
   delta:=-before_opening;
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('id',a.id,'name',a.name,'currency',a.currency,
   'counted_balance',o.amount,'counted_at',o.created_at,'opening_date',o.business_date,'opening_entry_id',o.ledger_entry_id,
   'balance_before',current_balance,'ledger_delta',delta,'balance_after',current_balance+delta,'already_reconciled',done));
 end loop;
 select * into redot from accounts where is_active and lower(name) in('redot','redotpay') and currency='TRY';
 if (select count(*)from accounts where is_active and lower(name) in('redot','redotpay') and currency='TRY')>1 then raise exception 'More than one active TL Redot account exists; review account setup';end if;
 result:=jsonb_build_object('rows',rows,'retire',retire,'create_redot_try',redot.id is null,'already_applied',false);
 token:=encode(sha256(convert_to(result::text,'UTF8')),'hex');
 result:=result||jsonb_build_object('token',token);
 if not coalesce(p_apply,false) then return result;end if;
 if p_token is distinct from token then raise exception 'Account balances or setup changed; reload the reconciliation preview';end if;
 if exists(select 1 from jsonb_array_elements(retire)x where (x->>'pending')::int>0) then
  raise exception 'Resolve pending orders, withdrawals and open advances on accounts being retired before applying';
 end if;
 for row in select * from jsonb_array_elements(rows) loop
  if (row->>'already_reconciled')::boolean then continue;end if;
  delta:=(row->>'ledger_delta')::numeric;eid:=null;
  select * into o from account_openings where account_id=(row->>'id')::smallint;
  if delta<>0 then
   rate:=coalesce(o.rate_to_try,resolve_rate(o.account_id,null));
   perform m5_amount(delta,false);
   insert into ledger_entries(account_id,entry_type,amount,rate_to_try,amount_try,business_date,note,created_by)
   values(o.account_id,'adjustment',delta,rate,round(delta*rate,2),o.business_date,'Reconcile confirmed go-live balance; later movements preserved',uid) returning id into eid;
  end if;
  insert into go_live_balance_receipts(account_id,details,applied_by)values(o.account_id,row||jsonb_build_object('ledger_entry_id',eid),uid);
  perform log_activity('account.opening_reconcile','accounts',o.account_id::text,row||jsonb_build_object('ledger_entry_id',eid));
  row_count:=row_count+1;
 end loop;
 for row in select * from jsonb_array_elements(retire) loop
  if lower(row->>'name') like 'redot%' and lower(row->>'name') in('redot','redotpay') then
   update accounts set name='RedotPay (legacy '||(row->>'currency')||' #'||(row->>'id')||')',is_active=false where id=(row->>'id')::smallint;
  else update accounts set is_active=false where id=(row->>'id')::smallint;end if;
  perform log_activity('account.retire','accounts',row->>'id',row);
 end loop;
 if redot.id is null then
  if exists(select 1 from accounts where lower(name)='redotpay') then raise exception 'An inactive RedotPay account already uses that name; review account setup';end if;
  insert into accounts(name,currency,sort_order)values('RedotPay','TRY',5)returning id into new_id;
  perform log_activity('account.redot_try_transition','accounts',new_id::text,jsonb_build_object('opening_required',true));
 else new_id:=redot.id;end if;
 result:=result||jsonb_build_object('already_applied',true,'redot_try_account_id',new_id,'reconciled_accounts',row_count);
 insert into go_live_setup_runs(preview_token,result,applied_by)values(token,result,uid);
 return result;
end $$;
revoke all on function reconcile_go_live_balances(boolean,text) from public,anon;
grant execute on function reconcile_go_live_balances(boolean,text) to authenticated;
-- Acquire reconciliation lock before the opening dispatcher's account row lock.
do $$ declare definition text; amended text;begin
 definition:=pg_get_functiondef('public.run_debt_action(text,jsonb,uuid)'::regprocedure);
 amended:=replace(definition,'perform public.m8_lock_current_day();',
  'perform public.m8_lock_current_day(); if p_action=''opening'' then perform pg_advisory_xact_lock(hashtextextended(''sfx-go-live-balances'',0));end if;');
 if amended=definition then raise exception 'Cannot install opening reconciliation lock';end if;
 execute amended;
end $$;
notify pgrst, 'reload schema';
commit;
