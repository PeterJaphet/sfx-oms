begin;
-- The UI's Delete is an audited reversal, never a physical deletion. Retrying
-- the same purchase cannot refund twice or append repeated reversal notes.
create or replace function reverse_purchase(p_purchase uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); pu purchases; eid bigint; debt_row debts;
begin
 perform public.m8_lock_current_day();
 if coalesce(length(trim(p_reason)),0)<3 or length(trim(p_reason))>1000 then raise exception 'Enter a deletion reason between 3 and 1000 characters';end if;
 -- Match reverse_entry's ledger-before-purchase lock order for direct purchases.
 select id into eid from ledger_entries where purchase_id=p_purchase and entry_type='purchase_direct' for update;
 select * into pu from purchases where id=p_purchase for update;
 if pu.id is null then raise exception 'Purchase not found';end if;
 if pu.is_reversed then return;end if;
 if pu.debt_id is not null then
  select * into debt_row from debts where id=pu.debt_id for update;
  if exists(select 1 from debt_settlements s where s.debt_id=pu.debt_id
    and not exists(select 1 from ledger_entries r where r.reverses_id=s.ledger_entry_id)) then
   raise exception 'This purchase has supplier payments; reverse those payments before deleting it';
  end if;
 end if;
 if eid is not null then
  perform reverse_entry(eid,trim(p_reason));
 else
  update purchases set is_reversed=true where id=pu.id;
 end if;
 update purchases set note=coalesce(note||' | ','')||'Deleted (reversed): '||trim(p_reason) where id=pu.id;
 if pu.debt_id is not null then
  update debts set is_cancelled=true,cancel_reason='Purchase reversed: '||trim(p_reason) where id=pu.debt_id;
 end if;
 perform log_activity('purchase.reverse','purchases',pu.id::text,jsonb_build_object('reason',trim(p_reason),'account_id',pu.account_id,'advance_id',pu.advance_id,'debt_id',pu.debt_id));
end $$;
revoke all on function reverse_purchase(uuid,text) from public,anon;
grant execute on function reverse_purchase(uuid,text) to authenticated;
commit;
