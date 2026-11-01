begin;
-- Existing withdrawal records keep their original dates and approval behavior.
alter table withdrawals add column taken_out_date date;
create function withdrawal_business_date(p_date date) returns date
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); d date:=coalesce(p_date,business_date());
begin
 if d>business_date() then raise exception 'Cannot enter a future withdrawal date';end if;
 if d<business_date() and app_role()<>'admin' then raise exception 'Only Admin can enter an earlier withdrawal date';end if;
 return d;
end $$;
revoke all on function withdrawal_business_date(date) from public,anon,authenticated;
create function post_dated_withdrawal(w withdrawals,p_date date) returns bigint
language plpgsql security definer set search_path=public,pg_catalog as $$
declare eid bigint;
begin
 insert into ledger_entries(account_id,entry_type,amount,rate_to_try,amount_try,withdrawal_id,note,created_by,business_date)
 values(w.account_id,w.kind::text::entry_type,-w.amount,w.rate_to_try,-w.amount_try,w.id,w.purpose,auth.uid(),p_date)
 returning id into eid;
 return eid;
end $$;
revoke all on function post_dated_withdrawal(withdrawals,date) from public,anon,authenticated;
create function create_dated_withdrawal(p jsonb) returns withdrawals
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  uid uuid := require_role('operations', 'admin');
  p_kind withdrawal_kind:=(p->>'kind')::withdrawal_kind;
  p_account smallint:=(p->>'account_id')::smallint; p_amount numeric:=(p->>'amount')::numeric;
  p_purpose text:=p->>'purpose'; p_category smallint:=(p->>'category_id')::smallint;
  p_recipient uuid:=nullif(p->>'recipient_id','')::uuid; p_rate numeric:=nullif(p->>'rate','')::numeric;
  p_receipt_path text:=nullif(p->>'receipt_path','');
  d date:=withdrawal_business_date(nullif(p->>'withdrawal_date','')::date);
  s settings; w withdrawals; rate numeric; needs_approval boolean;
begin
  perform m8_lock_current_day();
  perform pg_advisory_xact_lock_shared(hashtextextended('financial-day:'||d::text,0));
  perform m5_amount(p_amount);
  if p_rate is not null then perform m5_rate(p_rate); end if;
  if p_kind is null then raise exception 'Choose a withdrawal type'; end if;
  if coalesce(length(trim(p_purpose)),0)<3 then raise exception 'A purpose of at least 3 characters is required'; end if;
  if not exists(select 1 from expense_categories where id=p_category and is_active) then raise exception 'Choose an active category'; end if;
  if p_kind='advance' and not exists(select 1 from profiles where id=p_recipient and is_active) then raise exception 'Choose an active staff recipient'; end if;
  if nullif(p_receipt_path,'') is not null and (split_part(p_receipt_path,'/',1)<>uid::text
    or not exists(select 1 from storage.objects where bucket_id='receipts' and name=p_receipt_path)) then raise exception 'Receipt must be uploaded in your own folder'; end if;
  perform 1 from accounts where id=p_account for update;
  select * into s from settings;
  rate := resolve_rate(p_account, p_rate);

  if p_kind = 'advance' then
    if p_recipient is null then raise exception 'Choose who receives the advance'; end if;
    if app_role() <> 'admin' and exists (
        select 1 from v_advances a where a.recipient_id = p_recipient and a.state = 'open'
           and a.business_date < business_date() - s.advance_max_age_days) then
      raise exception 'This person has an advance older than % days that is not yet accounted for',
        s.advance_max_age_days;
    end if;
  end if;

  needs_approval := app_role() <> 'admin'
    and s.withdrawal_approval_limit_try is not null
    and round(p_amount * rate, 2) > s.withdrawal_approval_limit_try;

  if account_balance(p_account) < p_amount then
    raise exception 'Not enough money in this account (balance %)', account_balance(p_account);
  end if;

  insert into withdrawals (kind, account_id, amount, rate_to_try, amount_try, purpose, category_id,
                           recipient_id, receipt_path, status, requested_by, decided_by, decided_at, business_date, taken_out_date)
  values (p_kind, p_account, p_amount, rate, round(p_amount * rate, 2), trim(p_purpose), p_category,
          p_recipient, p_receipt_path,
          case when needs_approval then 'pending_approval' else 'approved' end::withdrawal_status,
          uid, case when needs_approval then null else uid end,
          case when needs_approval then null else now() end, d, d)
  returning * into w;

  if not needs_approval then
    perform post_dated_withdrawal(w, d);
  end if;
  perform log_activity('withdrawal.create', 'withdrawals', w.id::text,
    jsonb_build_object('kind', p_kind, 'amount', p_amount, 'status', w.status, 'purpose', w.purpose,'business_date',d,'recorded_at',w.requested_at));
  return w;
end $$;

create or replace function quote_withdrawal(p jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); acct accounts; s settings; amt numeric:=(p->>'amount')::numeric;
 d date:=withdrawal_business_date(nullif(p->>'withdrawal_date','')::date); q jsonb; rate numeric; bal numeric; approval boolean; kind withdrawal_kind:=(p->>'kind')::withdrawal_kind;
begin
 perform m5_amount(amt);
 if kind is null then raise exception 'Choose a withdrawal type'; end if;
 if coalesce(length(trim(p->>'purpose')),0)<3 then raise exception 'A purpose of at least 3 characters is required'; end if;
 if not exists(select 1 from expense_categories where id=(p->>'category_id')::smallint and is_active) then raise exception 'Choose an active category'; end if;
 if kind='advance' and not exists(select 1 from profiles where id=(p->>'recipient_id')::uuid and is_active) then raise exception 'Choose an active staff recipient'; end if;
 select * into acct from accounts where id=(p->>'account_id')::smallint and is_active;
 if acct.id is null then raise exception 'Choose an active account'; end if;
 if nullif(p->>'rate','') is not null then perform m5_rate((p->>'rate')::numeric); end if;
 rate:=resolve_rate(acct.id,nullif(p->>'rate','')::numeric);
 select * into s from settings;
 if kind='advance' and app_role()<>'admin' and exists(select 1 from v_advances where recipient_id=(p->>'recipient_id')::uuid and state='open' and business_date<public.business_date()-s.advance_max_age_days) then
  raise exception 'This person has an advance older than % days that is not yet accounted for',s.advance_max_age_days;
 end if;
 select balance into bal from v_account_balances where id=acct.id;
 if bal<amt then raise exception 'Not enough money in this account (balance %)',bal; end if;
 approval:=app_role()<>'admin' and s.withdrawal_approval_limit_try is not null and round(amt*rate,2)>s.withdrawal_approval_limit_try;
 q:=jsonb_build_object('business_date',d,'currency',acct.currency,'account_name',acct.name,'amount',round(amt,2),
 'amount_try',round(amt*rate,2),'rate_to_try',round(rate,6),'balance_before',bal,'balance_after',case when approval then bal else bal-amt end,
 'balance_if_approved',bal-amt,'needs_approval',approval);
 return q||jsonb_build_object('quote_token',encode(sha256(convert_to(q::text,'UTF8')),'hex'));
end $$;

revoke all on function create_dated_withdrawal(jsonb) from public,anon;
grant execute on function create_dated_withdrawal(jsonb) to authenticated;
do $$
declare definition text; amended text;
begin
 definition:=pg_get_functiondef('public.run_money_action(text,jsonb,uuid)'::regprocedure);
 definition:=replace(definition,'when ''withdraw'' then','when ''withdraw'' then perform pg_advisory_xact_lock_shared(hashtextextended(''financial-day:''||withdrawal_business_date(nullif(p->>''withdrawal_date'','''')::date)::text,0));');
 amended:=regexp_replace(definition,'w:=create_withdrawal\([^;]+;','w:=create_dated_withdrawal(p);');
 if amended=definition then raise exception 'Cannot install dated withdrawal dispatcher';end if;
 execute amended;
 definition:=pg_get_functiondef('public.decide_withdrawal(uuid,boolean,text)'::regprocedure);
 definition:=replace(definition,'perform public.m8_lock_current_day();',
  'perform public.m8_lock_current_day(); perform pg_advisory_xact_lock_shared(hashtextextended(''financial-day:''||coalesce((select taken_out_date from withdrawals where id=p_withdrawal),public.business_date())::text,0));');
 amended:=regexp_replace(definition,'perform post_entry\(w.account_id,[^;]+;',
  'perform post_dated_withdrawal(w,coalesce(w.taken_out_date,public.business_date()));');
 if amended=definition then raise exception 'Cannot install dated withdrawal approval';end if;
 execute amended;
end $$;
notify pgrst, 'reload schema';
commit;
