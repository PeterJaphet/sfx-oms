-- M5: previews, request recovery, audits, and stronger money validation.
-- Existing RPC signatures, role checks and RLS policies are preserved.
begin;

create function m5_amount(p_amount numeric,p_positive boolean default true) returns void
language plpgsql immutable set search_path=public,pg_catalog as $$
begin
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount=0
    or (p_positive and p_amount<0) or abs(p_amount)>999999999999.99 or p_amount<>round(p_amount,2) then
  raise exception 'Enter a % amount with at most 2 decimals',case when p_positive then 'positive' else 'non-zero' end;
 end if;
end $$;
revoke all on function m5_amount(numeric,boolean) from public,anon,authenticated;
create function m5_rate(p_rate numeric) returns void
language plpgsql immutable set search_path=public,pg_catalog as $$
begin
 if p_rate is null or p_rate::text in ('NaN','Infinity','-Infinity') or p_rate<=0
    or p_rate>999999999999.999999 or p_rate<>round(p_rate,6) then raise exception 'Enter a positive rate with at most 6 decimals'; end if;
end $$;
revoke all on function m5_rate(numeric) from public,anon,authenticated;

-- INVOKER is intentional: direct client INSERTs skip this balance lookup and
-- are still denied by the existing ledger RLS, without leaking private balances.
-- post_entry executes as its owner, so legitimate RPC postings lock the account.
create function trg_m5_ledger_funds() returns trigger
language plpgsql set search_path=public,pg_catalog as $$
declare bal numeric;
begin
 if current_user in ('authenticated','anon') then return new; end if;
 perform 1 from accounts where id=new.account_id for update;
 if new.entry_type in ('advance','direct_expense','transfer_out','purchase_direct','debt_out','advance_topup') then
  if new.amount::text in ('NaN','Infinity','-Infinity') or new.amount>=0 then raise exception 'Money out must be a negative ledger amount'; end if;
  bal:=account_balance(new.account_id);
  if bal < -new.amount then raise exception 'Not enough money in this account (balance %)',bal; end if;
 end if;
 return new;
end $$;
revoke all on function trg_m5_ledger_funds() from public,anon,authenticated;
create trigger m5_ledger_funds before insert on ledger_entries for each row execute function trg_m5_ledger_funds();

create or replace function create_withdrawal(
  p_kind withdrawal_kind, p_account smallint, p_amount numeric, p_purpose text,
  p_category smallint default null, p_recipient uuid default null,
  p_rate numeric default null, p_receipt_path text default null
) returns withdrawals
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('operations', 'admin');
  s settings; w withdrawals; rate numeric; needs_approval boolean;
begin
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
                           recipient_id, receipt_path, status, requested_by, decided_by, decided_at)
  values (p_kind, p_account, p_amount, rate, round(p_amount * rate, 2), trim(p_purpose), p_category,
          p_recipient, p_receipt_path,
          case when needs_approval then 'pending_approval' else 'approved' end::withdrawal_status,
          uid, case when needs_approval then null else uid end,
          case when needs_approval then null else now() end)
  returning * into w;

  if not needs_approval then
    perform post_entry(p_account, p_kind::text::entry_type, -p_amount, rate, p_withdrawal => w.id,
                       p_note => w.purpose);
  end if;
  perform log_activity('withdrawal.create', 'withdrawals', w.id::text,
    jsonb_build_object('kind', p_kind, 'amount', p_amount, 'status', w.status, 'purpose', w.purpose));
  return w;
end $$;

create or replace function decide_withdrawal(p_withdrawal uuid, p_approve boolean, p_note text default null)
returns withdrawals language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin'); w withdrawals;
begin
  select * into w from withdrawals where id = p_withdrawal for update;
  if w.id is null then raise exception 'Withdrawal not found'; end if;
  if p_approve is null then raise exception 'Choose approve or reject'; end if;
  perform 1 from accounts where id=w.account_id for update;
  if p_approve and not exists(select 1 from accounts where id=w.account_id and is_active) then raise exception 'Account is inactive'; end if;
  if w.status <> 'pending_approval' then raise exception 'Withdrawal is already %', w.status; end if;
  if p_approve and account_balance(w.account_id) < w.amount then
    raise exception 'Not enough money in this account';
  end if;
  update withdrawals set status = case when p_approve then 'approved' else 'rejected' end::withdrawal_status,
         decided_by = uid, decided_at = now(), decision_note = p_note
   where id = p_withdrawal returning * into w;
  if p_approve then
    perform post_entry(w.account_id, w.kind::text::entry_type, -w.amount, w.rate_to_try,
                       p_withdrawal => w.id, p_note => w.purpose);
  end if;
  perform log_activity(case when p_approve then 'withdrawal.approve' else 'withdrawal.reject' end,
                       'withdrawals', w.id::text, jsonb_build_object('note', p_note));
  return w;
end $$;

create or replace function transfer_between_accounts(p_from smallint, p_to smallint, p_amount_from numeric,
                                                     p_amount_to numeric default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin'); t uuid; rf numeric; rt numeric; try_val numeric; fc text; tc text;
begin
  perform m5_amount(p_amount_from);
  if p_from is null or p_to is null or p_from=p_to then raise exception 'Choose two different accounts'; end if;
  perform 1 from accounts where id in (p_from,p_to) order by id for update;
  select currency into fc from accounts where id=p_from and is_active;
  select currency into tc from accounts where id=p_to and is_active;
  if fc is null or tc is null then raise exception 'Choose active accounts'; end if;
  if fc<>tc and p_amount_to is null then raise exception 'Enter the amount received in %',tc; end if;
  if p_amount_to is not null then perform m5_amount(p_amount_to); end if;
  if fc=tc and coalesce(p_amount_to,p_amount_from)<>p_amount_from then raise exception 'Same-currency transfers must send and receive the same amount'; end if;
  if account_balance(p_from) < p_amount_from then raise exception 'Not enough money in the source account'; end if;
  rf := resolve_rate(p_from, null);
  try_val := round(p_amount_from * rf, 2);
  p_amount_to := coalesce(p_amount_to, p_amount_from);
  rt := round(try_val / p_amount_to, 6);
  insert into account_transfers (from_account, to_account, note, created_by)
  values (p_from, p_to, p_note, uid) returning id into t;
  perform post_entry(p_from, 'transfer_out', -p_amount_from, rf, p_transfer => t, p_note => p_note);
  perform post_entry(p_to, 'transfer_in', p_amount_to, rt, p_transfer => t, p_note => p_note,
                     p_amount_try => try_val);
  perform log_activity('account.transfer','account_transfers',t::text,jsonb_build_object('from_account',p_from,'to_account',p_to,'amount_from',p_amount_from,'amount_to',p_amount_to));
  return t;
end $$;

create or replace function adjust_balance(p_account smallint, p_amount numeric, p_reason text,
                                          p_opening boolean default false, p_rate numeric default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin');
begin
  perform m5_amount(p_amount,false);
  if p_rate is not null then perform m5_rate(p_rate); end if;
  perform 1 from accounts where id=p_account for update;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'A reason is required'; end if;
  if p_opening and exists (select 1 from ledger_entries where account_id = p_account and entry_type = 'opening_balance') then
    raise exception 'This account already has an opening balance; use an adjustment instead';
  end if;
  perform log_activity('account.adjust', 'accounts', p_account::text,
    jsonb_build_object('amount', p_amount, 'reason', p_reason, 'opening', p_opening));
  return post_entry(p_account, case when p_opening then 'opening_balance' else 'adjustment' end::entry_type,
                    p_amount, resolve_rate(p_account, p_rate), p_note => p_reason);
end $$;

create or replace function reverse_entry(p_entry bigint, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin'); e ledger_entries; rid bigint;
begin
  if coalesce(length(trim(p_reason)),0)<3 then raise exception 'A reason is required'; end if;
  select * into e from ledger_entries where id = p_entry for update;
  if e.id is null then raise exception 'Entry not found'; end if;
  if e.entry_type = 'reversal' then raise exception 'Cannot reverse a reversal'; end if;
  rid := post_entry(e.account_id, 'reversal', -e.amount, e.rate_to_try, p_order => e.order_id,
                    p_withdrawal => e.withdrawal_id, p_purchase => e.purchase_id, p_transfer => e.transfer_id,
                    p_reverses => e.id, p_note => p_reason, p_amount_try => -e.amount_try, p_debt => e.debt_id);
  if e.entry_type in ('advance', 'direct_expense') then
    update withdrawals set status = 'reversed', decision_note = p_reason where id = e.withdrawal_id;
  elsif e.entry_type = 'purchase_direct' then
    update purchases set is_reversed = true where id = e.purchase_id;
  end if;
  perform log_activity('ledger.reverse', 'ledger_entries', e.id::text, jsonb_build_object('reason', p_reason));
  return rid;
end $$;

create or replace function set_fx_rate(p_currency text, p_rate numeric) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := require_role('admin');
begin
  if upper(p_currency) not in ('USD','NGN') or p_currency is null then raise exception 'Choose USD or NGN'; end if;
  perform m5_rate(p_rate);
  insert into fx_rates (currency, rate_to_try, set_by) values (upper(p_currency), p_rate, uid)
  on conflict (currency, effective_date) do update set rate_to_try = excluded.rate_to_try, set_by = excluded.set_by;
end $$;

create function set_approval_limit(p_limit numeric) returns settings
language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); result settings;
begin
 if p_limit is not null then perform m5_amount(p_limit); end if;
 update settings set withdrawal_approval_limit_try=p_limit,updated_at=now() where id returning * into result;
 return result;
end $$;
revoke all on function set_approval_limit(numeric) from public,anon;
grant execute on function set_approval_limit(numeric) to authenticated;

create function trg_m5_config_audit() returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if tg_op='INSERT' or new is distinct from old then
  perform log_activity(case when tg_table_name='fx_rates' then 'fx_rate.set' else 'settings.update' end,
   tg_table_name,new.id::text,case when tg_op='UPDATE' then jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)) else to_jsonb(new) end);
 end if;
 return new;
end $$;
revoke all on function trg_m5_config_audit() from public,anon,authenticated;
create trigger m5_fx_audit after insert or update on fx_rates for each row execute function trg_m5_config_audit();
create trigger m5_settings_audit after update on settings for each row execute function trg_m5_config_audit();

-- Read-only server preview. Money maths and approval decisions stay here.
create function quote_withdrawal(p jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); acct accounts; s settings; amt numeric:=(p->>'amount')::numeric;
 q jsonb; rate numeric; bal numeric; approval boolean; kind withdrawal_kind:=(p->>'kind')::withdrawal_kind;
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
 q:=jsonb_build_object('business_date',public.business_date(),'currency',acct.currency,'account_name',acct.name,'amount',round(amt,2),
 'amount_try',round(amt*rate,2),'rate_to_try',round(rate,6),'balance_before',bal,'balance_after',case when approval then bal else bal-amt end,
 'balance_if_approved',bal-amt,'needs_approval',approval);
 return q||jsonb_build_object('quote_token',encode(sha256(convert_to(q::text,'UTF8')),'hex'));
end $$;
revoke all on function quote_withdrawal(jsonb) from public,anon;
grant execute on function quote_withdrawal(jsonb) to authenticated;

-- One compact recovery record per actor/request. No raw payloads and no client policy.
create table money_requests(
 actor_id uuid not null references profiles(id),request_id uuid not null,action text not null,
 request_hash text not null check(length(request_hash)=64),result jsonb not null,
 created_at timestamptz not null default now(),primary key(actor_id,request_id)
);
alter table money_requests enable row level security;
revoke all on money_requests from public,anon,authenticated;
create trigger no_delete before delete on money_requests for each row execute function trg_no_delete();
create trigger immutable before update on money_requests for each row execute function trg_ledger_immutable();

-- This small dispatcher delegates to each original guarded RPC. It grants no
-- authority beyond those functions, and exposes no arbitrary SQL or table writes.
create function run_money_action(p_action text,p jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid; h text; prior money_requests; result jsonb; w withdrawals; eid bigint; tid uuid;
begin
 if p_action='withdraw' then uid:=require_role('operations','admin'); else uid:=require_role('admin'); end if;
 if p_request_id is null then raise exception 'A request id is required'; end if;
 if p_action not in ('withdraw','decide','transfer','adjust','reverse','rate','limit') then raise exception 'Unknown money action'; end if;
 h:=encode(sha256(convert_to(jsonb_build_array(p_action,p)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('money:'||uid::text||':'||p_request_id::text,0));
 select * into prior from money_requests where actor_id=uid and request_id=p_request_id;
 if found then
  if prior.request_hash<>h then raise exception 'Money request id was already used with different details'; end if;
  return prior.result;
 end if;
 case p_action
 when 'withdraw' then
  perform 1 from accounts where id=(p->>'account_id')::smallint for update;
  perform 1 from settings for share;
  if p ? 'quote_token' and (p->>'quote_token') is distinct from (quote_withdrawal(p)->>'quote_token') then raise exception 'Balance or approval rules changed; review the updated preview'; end if;
  w:=create_withdrawal((p->>'kind')::withdrawal_kind,(p->>'account_id')::smallint,(p->>'amount')::numeric,p->>'purpose',
   (p->>'category_id')::smallint,(p->>'recipient_id')::uuid,nullif(p->>'rate','')::numeric,nullif(p->>'receipt_path',''));
  result:=jsonb_build_object('action',p_action,'id',w.id,'status',w.status,'account_id',w.account_id);
 when 'decide' then
  w:=decide_withdrawal((p->>'withdrawal_id')::uuid,(p->>'approve')::boolean,p->>'note');
  result:=jsonb_build_object('action',p_action,'id',w.id,'status',w.status,'account_id',w.account_id);
 when 'transfer' then
  tid:=transfer_between_accounts((p->>'from_account')::smallint,(p->>'to_account')::smallint,(p->>'amount_from')::numeric,(p->>'amount_to')::numeric,p->>'note');
  result:=jsonb_build_object('action',p_action,'id',tid);
 when 'adjust' then
  -- M5 adjustments never masquerade as M7 opening balances.
  eid:=adjust_balance((p->>'account_id')::smallint,(p->>'amount')::numeric,p->>'reason',false,nullif(p->>'rate','')::numeric);
  result:=jsonb_build_object('action',p_action,'id',eid);
 when 'reverse' then
  eid:=reverse_entry((p->>'entry_id')::bigint,p->>'reason');
  result:=jsonb_build_object('action',p_action,'id',eid);
 when 'rate' then
  perform set_fx_rate(p->>'currency',(p->>'rate')::numeric);
  result:=jsonb_build_object('action',p_action,'currency',upper(p->>'currency'),'business_date',public.business_date());
 when 'limit' then
  perform set_approval_limit((p->>'limit')::numeric);
  result:=jsonb_build_object('action',p_action);
 end case;
 insert into money_requests(actor_id,request_id,action,request_hash,result) values(uid,p_request_id,p_action,h,result);
 return result;
end $$;
revoke all on function run_money_action(text,jsonb,uuid) from public,anon;
grant execute on function run_money_action(text,jsonb,uuid) to authenticated;
commit;
