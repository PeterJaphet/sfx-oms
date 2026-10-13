-- M4: limited delivery payment visibility, audited payments and safe retries.
-- No existing table policy, role check, or money guard is removed.
begin;

create table order_payment_requests (
  actor_id uuid not null references profiles(id),
  request_id uuid not null,
  request_hash text not null check (length(request_hash)=64),
  ledger_entry_id bigint not null references ledger_entries(id),
  created_at timestamptz not null default now(),
  primary key (actor_id,request_id)
);
alter table order_payment_requests enable row level security;
-- No client read/write policy: request hashes are only used inside the RPC.
revoke all on order_payment_requests from public,anon,authenticated;
create trigger no_delete before delete on order_payment_requests for each row execute function trg_no_delete();

-- Four-argument calls, including create_order, retain their existing behavior.
-- The five-argument overload adds an opaque per-actor retry token for M4.
create function add_order_payment(p_order uuid,p_account smallint,p_amount_try numeric,
  p_amount numeric,p_request_id uuid) returns bigint
language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); h text; old_request order_payment_requests; eid bigint;
begin
  if p_request_id is null then raise exception 'A payment request id is required'; end if;
  if p_amount_try is null or p_amount_try::text in ('NaN','Infinity','-Infinity') or p_amount_try<=0
    or p_amount_try<>round(p_amount_try,2) then raise exception 'Payment must be more than 0 with at most 2 decimals'; end if;
  if p_amount is not null and (p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2)) then
    raise exception 'Received amount must be more than 0 with at most 2 decimals'; end if;
  h:=encode(sha256(convert_to(jsonb_build_array(p_order,p_account,p_amount_try,p_amount)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_request_id::text,0));
  select * into old_request from order_payment_requests where actor_id=uid and request_id=p_request_id;
  if found then
    if old_request.request_hash<>h then raise exception 'Payment request id was already used with different details'; end if;
    return old_request.ledger_entry_id;
  end if;
  eid:=add_order_payment(p_order,p_account,p_amount_try,p_amount);
  insert into order_payment_requests(actor_id,request_id,request_hash,ledger_entry_id) values(uid,p_request_id,h,eid);
  return eid;
end $$;
revoke all on function add_order_payment(uuid,smallint,numeric,numeric,uuid) from public,anon;
grant execute on function add_order_payment(uuid,smallint,numeric,numeric,uuid) to authenticated;

create function trg_order_payment_audit() returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if new.entry_type='order_payment' then
    perform log_activity('order.payment','orders',new.order_id::text,
      jsonb_build_object('ledger_entry_id',new.id,'account_id',new.account_id,'amount',new.amount,'amount_try',new.amount_try));
  end if;
  return new;
end $$;
revoke all on function trg_order_payment_audit() from public,anon,authenticated;
create trigger order_payment_audit after insert on ledger_entries for each row execute function trg_order_payment_audit();

-- Logistics needs paid/due badges but must never receive the account ledger.
-- This projection exposes totals only for active delivery work, across business days.
create function list_delivery_orders() returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('logistics','admin'); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'business_date',o.business_date,'daily_number',o.daily_number,'channel',o.channel,
    'order_type',o.order_type,'status',o.status,'customer_name',o.customer_name,'customer_phone',o.customer_phone,
    'delivery_address',o.delivery_address,'note',o.note,'subtotal',o.subtotal,'discount_amount',o.discount_amount,
    'discount_reason',o.discount_reason,'total',o.total,'created_at',o.created_at,
    'ready_at',o.ready_at,'picked_up_at',o.picked_up_at,'paid_try',p.paid_try,'balance_due',p.balance_due,
    'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_name',i.product_name,
      'variant_name',i.variant_name,'quantity',i.quantity,'line_total',i.line_total,'addons',i.addons,'note',i.note) order by i.id),'[]')
      from order_items i where i.order_id=o.id)
    ) order by coalesce(o.ready_at,o.created_at),o.created_at,o.id),'[]') into result
  from orders o join v_order_payments p on p.id=o.id
  where o.order_type='delivery' and o.status in ('ready','picked_up');
  return result;
end $$;
revoke all on function list_delivery_orders() from public,anon;
grant execute on function list_delivery_orders() to authenticated;
commit;
