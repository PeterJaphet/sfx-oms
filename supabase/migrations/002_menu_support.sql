-- M2: menu editing without deletion; existing order and money rules remain.
begin;
alter table public.product_addons add column is_active boolean not null default true;
create trigger no_delete before delete on public.product_categories for each row execute function public.trg_no_delete();
create trigger no_delete before delete on public.product_addons for each row execute function public.trg_no_delete();
create trigger log_menu after insert or update on public.product_categories for each row execute function public.trg_log_menu();

create function public.trg_log_menu_link() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform log_activity('product_addons.' || lower(tg_op), 'product_addons', new.product_id::text || '/' || new.addon_id::text,
    case when tg_op='UPDATE' then jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)) else to_jsonb(new) end);
  return new;
end $$;
create trigger log_menu after insert or update on public.product_addons for each row execute function public.trg_log_menu_link();

-- Active state is shared by an extra and its standalone item, just like its price.
create function public.trg_sync_extra_active() returns trigger
language plpgsql security definer set search_path=public as $$
declare extra uuid;
begin
  if tg_table_name='addons' then
    update products set is_active=new.is_active where addon_id=new.id and is_active is distinct from new.is_active;
    update product_variants pv set is_active=new.is_active from products p
      where p.id=pv.product_id and p.addon_id=new.id and pv.is_active is distinct from new.is_active;
  else
    if tg_table_name='products' then extra:=new.addon_id;
    else select addon_id into extra from products where id=new.product_id; end if;
    update addons set is_active=new.is_active where id=extra and is_active is distinct from new.is_active;
  end if;
  return new;
end $$;
create trigger sync_extra_active after update of is_active on public.addons for each row execute function public.trg_sync_extra_active();
create trigger sync_extra_active after update of is_active on public.products for each row execute function public.trg_sync_extra_active();
create trigger sync_extra_active after update of is_active on public.product_variants for each row execute function public.trg_sync_extra_active();

create function public.trg_initial_extra_variant() returns trigger
language plpgsql security definer set search_path=public as $$
declare a addons;
begin
  select a1.* into a from addons a1 join products p on p.addon_id=a1.id where p.id=new.product_id;
  if a.id is not null then new.price:=a.price; new.is_active:=a.is_active; end if;
  return new;
end $$;
create trigger initial_extra_variant before insert on public.product_variants for each row execute function public.trg_initial_extra_variant();

-- Invoker RPCs retain table RLS, enforce role, and save related menu rows atomically.
create function public.save_menu_product(p_product jsonb) returns uuid
language plpgsql security invoker set search_path=public as $$
declare uid uuid:=require_role('operations','admin'); pid uuid; vid uuid; row jsonb; ids uuid[]:='{}'; aid uuid;
begin
  if nullif(trim(p_product->>'name'),'') is null then raise exception 'Enter a product name'; end if;
  if jsonb_typeof(p_product->'variants') is distinct from 'array' or jsonb_array_length(p_product->'variants')=0 then
    raise exception 'A product needs at least one variant'; end if;
  pid:=nullif(p_product->>'id','')::uuid;
  if pid is null then
    insert into products(category_id,name,description,photo_path,is_active,created_by)
    values((p_product->>'category_id')::smallint,trim(p_product->>'name'),nullif(trim(p_product->>'description'),''),
      nullif(p_product->>'photo_path',''),coalesce((p_product->>'is_active')::boolean,true),uid) returning id into pid;
  else
    perform 1 from products where id=pid and addon_id is null for update;
    if not found then raise exception 'Product not found; edit standalone extras in Extras'; end if;
    update products set category_id=(p_product->>'category_id')::smallint,name=trim(p_product->>'name'),
      description=nullif(trim(p_product->>'description'),''),photo_path=nullif(p_product->>'photo_path',''),
      is_active=coalesce((p_product->>'is_active')::boolean,true) where id=pid;
  end if;
  for row in select * from jsonb_array_elements(p_product->'variants') loop
    if nullif(trim(row->>'name'),'') is null then raise exception 'Enter a variant name'; end if;
    if (row->>'price') is null or (row->>'price') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Price must be a positive amount with at most 2 decimals'; end if;
    vid:=nullif(row->>'id','')::uuid;
    if vid is null then
      insert into product_variants(product_id,name,price,is_active,sort_order)
      values(pid,trim(row->>'name'),(row->>'price')::numeric,coalesce((row->>'is_active')::boolean,true),cardinality(ids)) returning id into vid;
    else
      update product_variants set name=trim(row->>'name'),price=(row->>'price')::numeric,
        is_active=coalesce((row->>'is_active')::boolean,true),sort_order=cardinality(ids) where id=vid and product_id=pid;
      if not found then raise exception 'Variant does not belong to this product'; end if;
    end if;
    if vid=any(ids) then raise exception 'A variant appears twice'; end if;
    ids:=array_append(ids,vid);
  end loop;
  update product_variants set is_active=false where product_id=pid and not(id=any(ids)) and is_active;
  update product_addons set is_active=false where product_id=pid and is_active;
  for aid in select value::uuid from jsonb_array_elements_text(coalesce(p_product->'addon_ids','[]')) loop
    insert into product_addons(product_id,addon_id,is_active) values(pid,aid,true)
    on conflict(product_id,addon_id) do update set is_active=true;
  end loop;
  return pid;
end $$;

create function public.save_menu_extra(p_extra jsonb) returns uuid
language plpgsql security invoker set search_path=public as $$
declare uid uuid:=require_role('operations','admin'); aid uuid; pid uuid; dish uuid; cid smallint; active boolean;
begin
  if nullif(trim(p_extra->>'name'),'') is null then raise exception 'Enter an extra name'; end if;
  if (p_extra->>'price') is null or (p_extra->>'price') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Price must be a positive amount with at most 2 decimals'; end if;
  aid:=nullif(p_extra->>'id','')::uuid; active:=coalesce((p_extra->>'is_active')::boolean,true);
  if aid is null then
    insert into addons(name,price,is_active) values(trim(p_extra->>'name'),(p_extra->>'price')::numeric,active) returning id into aid;
  else
    update addons set name=trim(p_extra->>'name'),price=(p_extra->>'price')::numeric,is_active=active where id=aid;
    if not found then raise exception 'Extra not found'; end if;
  end if;
  select id into pid from products where addon_id=aid for update;
  if pid is null then
    select category_id into cid from products where addon_id is not null order by created_at limit 1;
    if cid is null then select id into cid from product_categories where name='Extras'; end if;
    if cid is null then raise exception 'Create the Extras category first'; end if;
    insert into products(category_id,name,addon_id,is_active,photo_path,created_by)
      values(cid,trim(p_extra->>'name'),aid,active,nullif(p_extra->>'photo_path',''),uid) returning id into pid;
  else
    update products set name=trim(p_extra->>'name'),is_active=active,photo_path=nullif(p_extra->>'photo_path','') where id=pid;
  end if;
  if not exists(select 1 from product_variants where product_id=pid) then
    insert into product_variants(product_id,price,is_active) values(pid,(p_extra->>'price')::numeric,active);
  end if;
  update product_addons set is_active=false where addon_id=aid and is_active;
  for dish in select value::uuid from jsonb_array_elements_text(coalesce(p_extra->'product_ids','[]')) loop
    if not exists(select 1 from products where id=dish and addon_id is null) then raise exception 'Extras can be assigned only to dishes'; end if;
    insert into product_addons(product_id,addon_id,is_active) values(dish,aid,true)
    on conflict(product_id,addon_id) do update set is_active=true;
  end loop;
  return aid;
end $$;

-- Exact, case-sensitive category + product + variant matches update price only.
-- Existing activation, descriptions, photos and extra assignments are retained.
create function public.import_menu_products(p_rows jsonb) returns integer
language plpgsql security invoker set search_path=public as $$
declare uid uuid:=require_role('operations','admin'); row jsonb; cid smallint; pid uuid; count_rows int:=0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Import between 1 and 500 rows'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x group by x->>'category',x->>'product',x->>'variant' having count(*)>1) then raise exception 'The CSV contains duplicate variants'; end if;
  for row in select * from jsonb_array_elements(p_rows) loop
    if nullif(trim(row->>'category'),'') is null or nullif(trim(row->>'product'),'') is null or nullif(trim(row->>'variant'),'') is null then raise exception 'Each row needs a category, product and variant'; end if;
    if (row->>'price') is null or (row->>'price') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Price must be a positive amount with at most 2 decimals'; end if;
    insert into product_categories(name) values(trim(row->>'category')) on conflict(name) do nothing;
    select id into cid from product_categories where name=trim(row->>'category');
    select id into pid from products where category_id=cid and name=trim(row->>'product');
    if exists(select 1 from products where id=pid and addon_id is not null) or exists(select 1 from products where category_id=cid and addon_id is not null) then
      raise exception 'Edit standalone extras in Extras; CSV imports dishes only'; end if;
    if pid is null then insert into products(category_id,name,created_by) values(cid,trim(row->>'product'),uid) returning id into pid; end if;
    insert into product_variants(product_id,name,price,sort_order)
      values(pid,trim(row->>'variant'),(row->>'price')::numeric,(select count(*) from product_variants where product_id=pid))
      on conflict(product_id,name) do update set price=excluded.price;
    count_rows:=count_rows+1;
  end loop;
  return count_rows;
end $$;

revoke execute on function public.trg_log_menu_link(),public.trg_sync_extra_active(),public.trg_initial_extra_variant() from public,anon,authenticated;
revoke execute on function public.save_menu_product(jsonb),public.save_menu_extra(jsonb),public.import_menu_products(jsonb) from public,anon;
grant execute on function public.save_menu_product(jsonb),public.save_menu_extra(jsonb),public.import_menu_products(jsonb) to authenticated;

-- Only active categories and active dish/extra links can be ordered.
create or replace function create_order(p_order jsonb) returns orders
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_role('operations', 'admin');
  o orders;
  it jsonb;
  v record;
  addon_list jsonb;
  addon_sum numeric;
  sub numeric := 0;
  num int;
  bdate date := business_date();
begin
  if jsonb_array_length(coalesce(p_order->'items', '[]')) = 0 then
    raise exception 'An order needs at least one item';
  end if;

  perform pg_advisory_xact_lock(hashtext('order-number-' || bdate));
  select coalesce(max(daily_number), 0) + 1 into num from orders where business_date = bdate;

  insert into orders (business_date, daily_number, channel, order_type, customer_name, customer_phone,
                      delivery_address, note, discount_amount, discount_reason, created_by)
  values (bdate, num, (p_order->>'channel')::order_channel,
          coalesce((p_order->>'order_type')::order_type, 'pickup'),
          nullif(p_order->>'customer_name', ''), nullif(p_order->>'customer_phone', ''),
          nullif(p_order->>'delivery_address', ''), nullif(p_order->>'note', ''),
          coalesce((p_order->>'discount_amount')::numeric, 0), nullif(p_order->>'discount_reason', ''), uid)
  returning * into o;

  for it in select * from jsonb_array_elements(p_order->'items') loop
    select pv.id, pv.name as variant_name, pv.price, p.id as product_id, p.name as product_name,
           pc.name as category_name
      into v
      from product_variants pv join products p on p.id = pv.product_id
      join product_categories pc on pc.id = p.category_id
     where pv.id = (it->>'variant_id')::uuid and pv.is_active and p.is_active and pc.is_active;
    if v.id is null then raise exception 'Item is not on the active menu: %', it->>'variant_id'; end if;

    -- Only extras set up for this product (product_addons) are allowed.
    if exists (select 1 from jsonb_array_elements_text(coalesce(it->'addon_ids', '[]')) x
                where not exists (select 1 from product_addons pa join addons a on a.id = pa.addon_id
                                   where pa.product_id = v.product_id and pa.addon_id = x::uuid and pa.is_active and a.is_active)) then
      raise exception 'An extra is not available on %', v.product_name;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('addon_id', a.id, 'name', a.name, 'price', a.price)), '[]'),
           coalesce(sum(a.price), 0)
      into addon_list, addon_sum
      from addons a
     where a.is_active and a.id in (select jsonb_array_elements_text(coalesce(it->'addon_ids', '[]'))::uuid);

    insert into order_items (order_id, variant_id, product_id, product_name, variant_name, category_name,
                             unit_price, quantity, addons, note)
    values (o.id, v.id, v.product_id, v.product_name, v.variant_name, v.category_name,
            v.price + addon_sum, coalesce((it->>'quantity')::int, 1), addon_list, nullif(it->>'note', ''));
    sub := sub + (v.price + addon_sum) * coalesce((it->>'quantity')::int, 1);
  end loop;

  if o.discount_amount > sub then raise exception 'Discount is larger than the order'; end if;
  update orders set subtotal = sub, total = sub - discount_amount where id = o.id returning * into o;

  if p_order ? 'payments' then
    for it in select * from jsonb_array_elements(p_order->'payments') loop
      perform add_order_payment(o.id, (it->>'account_id')::smallint, (it->>'amount_try')::numeric,
                                (it->>'amount')::numeric);
    end loop;
  end if;

  perform log_activity('order.create', 'orders', o.id::text,
    jsonb_build_object('number', o.daily_number, 'total', o.total));
  return o;
end $$;


-- Private, immutable menu photos. Storage exists in Supabase and in our test stub.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('menu-photos','menu-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy menu_photos_upload on storage.objects for insert to authenticated
with check(bucket_id='menu-photos' and public.app_role() in ('operations','admin')
  and public.m1_session_active() and (storage.foldername(name))[1]=auth.uid()::text);
create policy menu_photos_read on storage.objects for select to authenticated
using(bucket_id='menu-photos' and public.app_role() is not null and public.m1_session_active());
-- No update/delete policies and unique object names: replacement retains the old image.
commit;
