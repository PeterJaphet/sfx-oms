-- M6: Logistics purchase previews, accurate own-advance totals, and recovery.
-- No existing RLS policy or role guard is weakened. Receipts and due dates are optional.
begin;

-- Private shared validator/read model. It writes nothing and includes only the
-- selected funding source. Never expose it without the role check below.
create function m6_purchase_preview(p jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('logistics','admin'); it jsonb; total numeric:=0; amt numeric; qty numeric;
 adv record; acct accounts; rate numeric; cur text; bal numeric; q jsonb; mode text;
begin
 if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 50 then raise exception 'Add between 1 and 50 purchase items'; end if;
 if coalesce(length(trim(p->>'supplier')),0)<2 then raise exception 'Enter the supplier name'; end if;
 if not exists(select 1 from expense_categories where id=(p->>'category_id')::smallint and is_active) then raise exception 'Choose an active category'; end if;
 if (case when nullif(p->>'advance_id','') is not null then 1 else 0 end)+(case when nullif(p->>'account_id','') is not null then 1 else 0 end)+(case when coalesce((p->>'on_credit')::boolean,false) then 1 else 0 end)<>1 then raise exception 'Choose exactly one funding source'; end if;
 for it in select * from jsonb_array_elements(p->'items') loop
  if coalesce(length(trim(it->>'description')),0)<1 then raise exception 'Describe every purchase item'; end if;
  amt:=(it->>'amount')::numeric;
  if amt is null then raise exception 'Enter an amount for every item'; end if;
  if amt<>0 then perform m5_amount(amt); end if;
  qty:=nullif(it->>'quantity','')::numeric;
  -- Older records/RPC callers may omit quantity. When supplied it must be valid.
  if qty is not null and (qty::text in ('NaN','Infinity','-Infinity') or qty<=0 or qty>999999999.999 or qty<>round(qty,3)) then raise exception 'Enter a positive quantity with at most 3 decimals'; end if;
  total:=total+amt;
 end loop;
 perform m5_amount(total);
 if nullif(p->>'due_date','') is not null then perform (p->>'due_date')::date; end if;
 if nullif(p->>'rate','') is not null then perform m5_rate((p->>'rate')::numeric); end if;
 if nullif(p->>'advance_id','') is not null then
  select a.*,ac.currency into adv from v_advances a join accounts ac on ac.id=a.account_id where a.id=(p->>'advance_id')::uuid;
  if adv.id is null then raise exception 'Not an approved advance'; end if;
  if app_role()<>'admin' and adv.recipient_id<>uid then raise exception 'You can only log purchases against your own advances'; end if;
  if adv.state<>'open' then raise exception 'Choose an open advance'; end if;
  rate:=adv.rate_to_try;cur:=adv.currency;bal:=adv.remaining;mode:='advance';
 elsif coalesce((p->>'on_credit')::boolean,false) then
  rate:=1;cur:='TRY';bal:=null;mode:='credit';
 else
  select * into acct from accounts where id=(p->>'account_id')::smallint and is_active;
  if acct.id is null then raise exception 'Choose an active account'; end if;
  rate:=resolve_rate(acct.id,nullif(p->>'rate','')::numeric);cur:=acct.currency;bal:=account_balance(acct.id);mode:='account';
  if bal<total then raise exception 'Not enough money in this account (balance %)',bal; end if;
 end if;
 q:=jsonb_build_object('funding',mode,'business_date',public.business_date(),'currency',cur,'amount',round(total,2),'rate_to_try',round(rate,6),'amount_try',round(total*rate,2),
 'remaining_before',bal,'remaining_after',case when bal is not null then bal-total end,'owed_to_staff',case when mode='advance' then greatest(total-bal,0) else 0 end);
 return q||jsonb_build_object('quote_token',encode(sha256(convert_to(q::text,'UTF8')),'hex'));
end $$;
revoke all on function m6_purchase_preview(jsonb) from public,anon,authenticated;
create function quote_purchase(p jsonb) returns jsonb
language sql stable security definer set search_path=public,pg_catalog as $$select m6_purchase_preview(p)$$;
revoke all on function quote_purchase(jsonb) from public,anon;
grant execute on function quote_purchase(jsonb) to authenticated;

create or replace function log_purchase(p jsonb) returns purchases
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('logistics', 'admin');
  pu purchases; adv withdrawals; total numeric; rate numeric; acct smallint; it jsonb; dbt uuid; preview jsonb;
begin
  if nullif(p->>'advance_id','') is not null then perform 1 from withdrawals where id=(p->>'advance_id')::uuid for update;
  elsif nullif(p->>'account_id','') is not null then perform 1 from accounts where id=(p->>'account_id')::smallint for update; end if;
  preview:=m6_purchase_preview(p);
  if nullif(p->>'receipt_path','') is not null and (split_part(p->>'receipt_path','/',1)<>uid::text or not exists(select 1 from storage.objects where bucket_id='receipts' and name=p->>'receipt_path')) then raise exception 'Receipt must be uploaded in your own folder'; end if;
  select coalesce(sum((x->>'amount')::numeric), 0) into total
    from jsonb_array_elements(coalesce(p->'items', '[]')) x;
  if total <= 0 then raise exception 'Add at least one item with an amount'; end if;

  if p ? 'advance_id' and p->>'advance_id' is not null then
    select * into adv from withdrawals where id = (p->>'advance_id')::uuid;
    if adv.id is null or adv.kind <> 'advance' or adv.status <> 'approved' then
      raise exception 'Not an approved advance';
    end if;
    if app_role() <> 'admin' and adv.recipient_id <> uid then
      raise exception 'You can only log purchases against your own advances';
    end if;
    rate := adv.rate_to_try;
  elsif coalesce((p->>'on_credit')::boolean, false) then
    rate := 1;  -- credit purchases are in lira
    insert into debts (direction, counterparty, description, currency, amount, due_date, source, created_by)
    values ('we_owe', trim(p->>'supplier'), 'Supplies on credit', 'TRY', total,
            nullif(p->>'due_date','')::date, 'purchase_on_credit', uid)
    returning id into dbt;
  else
    acct := (p->>'account_id')::smallint;
    rate := resolve_rate(acct, (p->>'rate')::numeric);
    if account_balance(acct) < total then raise exception 'Not enough money in this account'; end if;
  end if;

  insert into purchases (supplier, category_id, advance_id, account_id, debt_id, amount, rate_to_try, amount_try,
                         receipt_path, note, logged_by)
  values (trim(p->>'supplier'), (p->>'category_id')::smallint, adv.id, acct, dbt, total, rate,
          round(total * rate, 2), nullif(p->>'receipt_path', ''), nullif(p->>'note', ''), uid)
  returning * into pu;

  for it in select * from jsonb_array_elements(p->'items') loop
    insert into purchase_items (purchase_id, description, quantity, unit, amount)
    values (pu.id, it->>'description', nullif(it->>'quantity','')::numeric, nullif(it->>'unit', ''),
            (it->>'amount')::numeric);
  end loop;

  if acct is not null then
    perform post_entry(acct, 'purchase_direct', -total, rate, p_purchase => pu.id, p_note => pu.supplier);
  end if;
  perform log_activity('purchase.create', 'purchases', pu.id::text,
    jsonb_build_object('supplier', pu.supplier, 'amount', total, 'advance_id', adv.id, 'on_credit', dbt is not null));
  return pu;
end $$;

-- Lock the advance before checking remaining funds. This serializes return
-- requests with purchase logging, while preserving overspend in log_purchase.
create function quote_return_change(p jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('logistics','admin'); a record; acct accounts; amt numeric:=(p->>'amount')::numeric; q jsonb;
begin
 perform m5_amount(amt);
 select v.*,ac.currency into a from v_advances v join accounts ac on ac.id=v.account_id where v.id=(p->>'advance_id')::uuid;
 if a.id is null then raise exception 'Advance not found'; end if;
 if app_role()<>'admin' and a.recipient_id<>uid then raise exception 'Not your advance'; end if;
 if amt>a.remaining then raise exception 'Amount must be between 0 and the % still held',a.remaining; end if;
 select * into acct from accounts where id=(p->>'account_id')::smallint and is_active;
 if acct.id is null then raise exception 'Choose an active account'; end if;
 if acct.currency<>a.currency then raise exception 'Return change into an account in %',a.currency; end if;
 q:=jsonb_build_object('business_date',public.business_date(),'currency',a.currency,'amount',round(amt,2),'rate_to_try',round(a.rate_to_try,6),'amount_try',round(amt*a.rate_to_try,2),'remaining_before',a.remaining,'remaining_after',a.remaining-amt);
 return q||jsonb_build_object('quote_token',encode(sha256(convert_to(q::text,'UTF8')),'hex'));
end $$;
revoke all on function quote_return_change(jsonb) from public,anon;
grant execute on function quote_return_change(jsonb) to authenticated;
create or replace function return_change(p_advance uuid, p_account smallint, p_amount numeric)
returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('logistics', 'admin'); a record; acct_cur text; adv_cur text;
begin
  perform m5_amount(p_amount);
  perform 1 from withdrawals where id=p_advance for update;
  perform 1 from accounts where id=p_account for update;
  perform quote_return_change(jsonb_build_object('advance_id',p_advance,'account_id',p_account,'amount',p_amount));
  select * into a from v_advances where id = p_advance;
  if a.id is null then raise exception 'Advance not found'; end if;
  if app_role() <> 'admin' and a.recipient_id <> uid then raise exception 'Not your advance'; end if;
  if p_amount <= 0 or p_amount > a.remaining + 0.005 then
    raise exception 'Amount must be between 0 and the % still held', a.remaining;
  end if;
  select currency into acct_cur from accounts where id = p_account;
  select ac.currency into adv_cur from withdrawals w join accounts ac on ac.id = w.account_id where w.id = p_advance;
  if acct_cur <> adv_cur then raise exception 'Return change into an account in %', adv_cur; end if;
  perform log_activity('advance.change_returned', 'withdrawals', p_advance::text, jsonb_build_object('amount', p_amount));
  return post_entry(p_account, 'change_returned', p_amount, a.rate_to_try, p_withdrawal => p_advance);
end $$;

-- Narrow read models: complete server totals for own assigned advances.
-- No ledger, other staff purchase details, or general account balances leak.
create function list_logistics_advances(p_state text default 'active',p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('logistics','admin'); result jsonb;
begin
 if p_state not in ('active','accounted') or p_offset<0 or p_offset is null then raise exception 'Choose a valid advance view'; end if;
 select coalesce(jsonb_agg(t),'[]') into result from (
  select v.*,a.name as account_name,a.currency from v_advances v join accounts a on a.id=v.account_id
  where (app_role()='admin' or v.recipient_id=uid) and (case when p_state='active' then v.state<>'accounted' else v.state='accounted' end)
  order by v.business_date,v.id limit case when p_state='active' then 10000 else 50 end offset p_offset
 ) t;
 return result;
end $$;
revoke all on function list_logistics_advances(text,int) from public,anon;
grant execute on function list_logistics_advances(text,int) to authenticated;

-- Only own purchases (Admin all). The linked credit debt exposes its due date
-- here without granting Logistics permission to read the debts table.
create function list_logistics_purchases(p_offset int default 0,p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('logistics','admin'); result jsonb;
begin
 if p_offset<0 or p_offset is null then raise exception 'Choose a valid purchase page'; end if;
 select coalesce(jsonb_agg(t),'[]') into result from (
  select pu.*,c.name as category_name,coalesce(a.currency,ac.currency,'TRY') as currency,
    coalesce(a.name,ac.name) as account_name,pr.full_name as staff_name,d.due_date,
    case when pu.advance_id is not null then 'advance' when pu.account_id is not null then 'account' else 'credit' end as funding
  from purchases pu join expense_categories c on c.id=pu.category_id join profiles pr on pr.id=pu.logged_by
  left join accounts a on a.id=pu.account_id left join withdrawals w on w.id=pu.advance_id left join accounts ac on ac.id=w.account_id left join debts d on d.id=pu.debt_id
  where (app_role()='admin' or pu.logged_by=uid) and (p_id is null or pu.id=p_id)
  order by pu.logged_at desc,pu.id limit 50 offset p_offset
 )t;
 return result;
end $$;
revoke all on function list_logistics_purchases(int,uuid) from public,anon;
grant execute on function list_logistics_purchases(int,uuid) to authenticated;

-- Reuse M5's private, append-only hashed recovery records; no client policy.
create function run_logistics_action(p_action text,p jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('logistics','admin'); h text; prior money_requests; result jsonb; pu purchases; eid bigint; q jsonb;
begin
 if p_action not in ('purchase','change') or p_action is null then raise exception 'Unknown logistics action'; end if;
 if p_request_id is null then raise exception 'A request id is required'; end if;
 h:=encode(sha256(convert_to(jsonb_build_array('logistics',p_action,p)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('money:'||uid::text||':'||p_request_id::text,0));
 select * into prior from money_requests where actor_id=uid and request_id=p_request_id;
 if found then
  if prior.request_hash<>h then raise exception 'Money request id was already used with different details'; end if;
  return prior.result;
 end if;
 if nullif(p->>'advance_id','') is not null then perform 1 from withdrawals where id=(p->>'advance_id')::uuid for update; end if;
 if nullif(p->>'account_id','') is not null then perform 1 from accounts where id=(p->>'account_id')::smallint for update; end if;
 if p_action='purchase' then
  q:=quote_purchase(p);
  if p ? 'quote_token' and (p->>'quote_token') is distinct from (q->>'quote_token') then raise exception 'Funding changed; review the updated preview'; end if;
  pu:=log_purchase(p);
  result:=jsonb_build_object('action',p_action,'id',pu.id,'business_date',pu.business_date,'currency',q->>'currency','amount',pu.amount,'amount_try',pu.amount_try,'debt_id',pu.debt_id);
 else
  q:=quote_return_change(p);
  if p ? 'quote_token' and (p->>'quote_token') is distinct from (q->>'quote_token') then raise exception 'Advance changed; review the updated preview'; end if;
  eid:=return_change((p->>'advance_id')::uuid,(p->>'account_id')::smallint,(p->>'amount')::numeric);
  result:=jsonb_build_object('action',p_action,'id',eid,'business_date',public.business_date(),'currency',q->>'currency','amount',q->'amount','remaining_after',q->'remaining_after');
 end if;
 insert into money_requests(actor_id,request_id,action,request_hash,result) values(uid,p_request_id,p_action,h,result);
 return result;
end $$;
revoke all on function run_logistics_action(text,jsonb,uuid) from public,anon;
grant execute on function run_logistics_action(text,jsonb,uuid) to authenticated;
commit;
