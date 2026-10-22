begin;

-- Read-only preview. Source rates are entered by Admin from the public SFXchange
-- page; no private API credentials or signing keys are copied into this app.
create function quote_marked_up_rate(p_currency text, p_source_rate numeric, p_direction text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid := require_role('admin'); effective numeric; customer numeric;
begin
 if p_currency is null or p_currency not in ('USD','NGN') then
  raise exception 'Choose USD or NGN';
 end if;
 perform m5_rate(p_source_rate);
 if p_direction = 'try_per_unit' then
  effective := round(p_source_rate / 1.02, 6);
 elsif p_direction = 'units_per_try' then
  effective := round(1 / (p_source_rate * 1.02), 6);
 else
  raise exception 'Choose how the source rate is quoted';
 end if;
 perform m5_rate(effective);
 customer := round(1 / effective, 6);
 return jsonb_build_object('rate_to_try',effective::text,
  'customer_units_per_try',customer::text);
end $$;
revoke all on function quote_marked_up_rate(text,numeric,text) from public,anon;
grant execute on function quote_marked_up_rate(text,numeric,text) to authenticated;

create function quote_foreign_order_amount(p_order jsonb,p_account smallint)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin'); acct accounts; q jsonb; r numeric; d date;
begin
 select * into acct from accounts where id=p_account and is_active;
 if acct.id is null or acct.currency not in ('USD','NGN') then raise exception 'Choose an active USD or NGN account'; end if;
 q:=quote_costed_order(p_order);
 select rate_to_try,effective_date into r,d from fx_rates where currency=acct.currency
 and effective_date<=business_date() order by effective_date desc,id desc limit 1;
 if r is null then raise exception 'Ask Admin to set the exchange rate first'; end if;
 perform m5_rate(r);
 return jsonb_build_object('amount',round((q->>'total')::numeric/r,2)::text,
 'currency',acct.currency,'rate_to_try',r::text,'effective_date',d);
end $$;
revoke all on function quote_foreign_order_amount(jsonb,smallint) from public,anon;
grant execute on function quote_foreign_order_amount(jsonb,smallint) to authenticated;

commit;
