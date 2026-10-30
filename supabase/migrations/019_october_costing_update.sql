begin;
-- Owner-supplied workbook update. No prices are applied to existing menu items.
-- The Admin reviews and applies it through the app so changes have a real actor.
create table costing_imports (
 import_key text primary key, result jsonb not null,
 applied_by uuid not null references profiles(id), applied_at timestamptz not null default now()
);
alter table costing_imports enable row level security;
revoke all on costing_imports from public,anon,authenticated;
create trigger no_delete before delete on costing_imports for each row execute function trg_no_delete();
create trigger immutable before update on costing_imports for each row execute function costing_immutable();

create function october_costing_update(p_apply boolean default false,p_token text default null,p_new_price numeric default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); source jsonb:=$source${"source_file":"SFx_Burger_Menu_Costing_and_PL EDITTED NEW.xlsx","sha256":"4441900fd10cd4485fedbd05b91525d732429da376d4c2c09ab619797a914914","recipes":[{"name":"Village Rice","menu_name":"Native Rice + Chicken","source_sheet":"Rice & Soup","source_range":"A38:B63","inputs":{"ingredients":[{"name":"Rice (1.5Kg)","cost":138.0},{"name":"Red long bell pepper","cost":400.0},{"name":"Hot pepper","cost":40.0},{"name":"Palm oil","cost":100.0},{"name":"Onions","cost":10.0},{"name":"Spinach","cost":74.0},{"name":"Tuzzot","cost":20.0},{"name":"Crayfish","cost":100.0},{"name":"Maggie","cost":10.0},{"name":"Chicken","cost":100.0},{"name":"Shaki and ponmo","cost":300.0}],"packaging":100,"overhead":0,"yield":7,"multiplier":2.14,"rounding":10,"planned_batches":0}},{"name":"Jollof Rice","menu_name":"Jollof Rice + Chicken","source_sheet":"Rice & Soup","source_range":"A67:B97","inputs":{"ingredients":[{"name":"Rice (2.8Kg)","cost":258.0},{"name":"Red long bell pepper","cost":345.0},{"name":"Hot pepper","cost":60.0},{"name":"Green bell pepper","cost":10.0},{"name":"Onions","cost":10.0},{"name":"Oil","cost":70.0},{"name":"Sweet Pepper paste","cost":63.0},{"name":"Hot pepper paste","cost":63.0},{"name":"Tomato paste","cost":50.0},{"name":"Ginger and garlic paste","cost":250.0},{"name":"Curry","cost":50.0},{"name":"Tuzzot","cost":15.0},{"name":"Thyme","cost":10.0},{"name":"Maggie","cost":63.0},{"name":"Black Pepper","cost":20.0},{"name":"Chicken","cost":100.0}],"packaging":100,"overhead":0,"yield":12,"multiplier":2,"rounding":10,"planned_batches":0}},{"name":"Vegetable Soup","menu_name":"Vegetable Soup","source_sheet":"Rice & Soup","source_range":"A101:B125","inputs":{"ingredients":[{"name":"Red long bell pepper","cost":230.0},{"name":"Hot pepper","cost":40.0},{"name":"Onions","cost":10.0},{"name":"Palm oil","cost":100.0},{"name":"Spinach","cost":75.0},{"name":"Tuzzot","cost":15.0},{"name":"Maggie","cost":8.0},{"name":"Shaki and ponmo","cost":150.0},{"name":"Crayfish","cost":50.0},{"name":"Chicken","cost":0.0}],"packaging":100,"overhead":0,"yield":5,"multiplier":2.15,"rounding":10,"planned_batches":0}},{"name":"SFx Special Shawarma","menu_name":"SFx Special Shawarma","source_sheet":"Fast Food","source_range":"A180:B212","inputs":{"ingredients":[{"name":"Chicken","cost":300.0},{"name":"Sweet pepper","cost":7.0},{"name":"Plantain","cost":30.0},{"name":"Garlic and ginger paste","cost":200.0},{"name":"Mustard","cost":20.0},{"name":"Black pepper","cost":5.0},{"name":"Red long bell pepper","cost":10.0},{"name":"Green bell pepper","cost":10.0},{"name":"Hot pepper powder","cost":7.0},{"name":"Onions powder","cost":5.0},{"name":"Maggie","cost":3.0},{"name":"Salt","cost":10.0},{"name":"Onion, cabbage and carrot","cost":65.0},{"name":"Mayonnaise","cost":250.0},{"name":"Ketchup","cost":0.0},{"name":"Milk","cost":14.0},{"name":"Oil","cost":10.0},{"name":"Shawarma bread","cost":72.0}],"packaging":100,"overhead":0,"yield":4,"multiplier":2,"rounding":10,"planned_batches":0}}]}$source$::jsonb;
 x jsonb; r cost_recipes; v product_variants; n int; inputs jsonb; rows jsonb:='[]'; row jsonb;
 result jsonb; token text; new_pid uuid; variant_id uuid; cid smallint; existing jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('sfx-costing',0));
 select i.result into existing from costing_imports i where import_key='2026-10-30-recipes';
 if found then return existing||jsonb_build_object('already_applied',true);end if;
 for x in select * from jsonb_array_elements(source->'recipes') loop
  r:=null;v:=null;
  select count(*)into n from cost_recipes cr where lower(cr.name)=lower(x->>'name') or cr.variant_id in
   (select pv.id from product_variants pv join products pr on pr.id=pv.product_id where lower(pr.name)=lower(x->>'menu_name'));
  if n>1 then raise exception 'More than one recipe matches %; review the recipe links first',x->>'menu_name';end if;
  select * into r from cost_recipes cr where lower(cr.name)=lower(x->>'name') or cr.variant_id in
   (select pv.id from product_variants pv join products pr on pr.id=pv.product_id where lower(pr.name)=lower(x->>'menu_name'));
  if r.addon_id is not null then raise exception 'Recipe % is linked to an extra; review its link first',r.name;end if;
  if r.variant_id is not null then
   select pv.* into v
    from product_variants pv join products pr on pr.id=pv.product_id where pv.id=r.variant_id;
  else
   select count(*)into n from product_variants pv join products pr on pr.id=pv.product_id where lower(pr.name)=lower(x->>'menu_name');
   if n>1 then raise exception 'More than one menu variant matches %; link its recipe first',x->>'menu_name';end if;
   select pv.* into v
    from product_variants pv join products pr on pr.id=pv.product_id where lower(pr.name)=lower(x->>'menu_name');
  end if;
  if v.id is null and x->>'menu_name'<>'SFx Special Shawarma' then raise exception 'Menu item % was not found; link the recipe before importing',x->>'menu_name';end if;
  if v.id is null and exists(select 1 from products where lower(name)=lower(x->>'menu_name')) then raise exception 'SFx Special Shawarma exists without a variant; finish its menu setup first';end if;
  if v.id is null and p_new_price is not null then
   perform m5_amount(p_new_price);
   if p_new_price>9999999999.99 then raise exception 'The new menu price is too large';end if;
  end if;
  inputs:=coalesce(r.inputs,x->'inputs')||jsonb_build_object('ingredients',x->'inputs'->'ingredients','packaging',x->'inputs'->'packaging','overhead',x->'inputs'->'overhead','yield',x->'inputs'->'yield');
  perform costing_recipe_math(inputs);
  rows:=rows||jsonb_build_array(jsonb_build_object('name',coalesce(r.name,x->>'name'),'menu_name',x->>'menu_name',
   'recipe_id',r.id,'revision',r.revision,'variant_id',v.id,'menu_price',v.price,'new_menu_price',case when v.id is null then p_new_price end,
   'current_inputs',r.inputs,'new_inputs',inputs,'current_unit_cost',case when r.id is not null then costing_recipe_math(r.inputs)->'unit_full_cost' end,
   'new_unit_cost',costing_recipe_math(inputs)->'unit_full_cost','needs_new_item',v.id is null));
 end loop;
 token:=encode(sha256(convert_to(rows::text,'UTF8')),'hex');
 result:=jsonb_build_object('rows',rows,'token',token,'already_applied',false,'source_sha256',source->>'sha256');
 if not coalesce(p_apply,false) then return result;end if;
 if p_token is distinct from token then raise exception 'Costing or menu details changed; reload the update preview';end if;
 for row in select * from jsonb_array_elements(rows) loop
  variant_id:=nullif(row->>'variant_id','')::uuid;
  if variant_id is null then
   if p_new_price is null then raise exception 'Enter the selling price for the new SFx Special Shawarma';end if;
   perform m5_amount(p_new_price);
   select id into cid from product_categories where lower(name)='shawarma' and is_active;
   if cid is null then raise exception 'The Shawarma menu category must be active';end if;
   new_pid:=save_menu_product(jsonb_build_object('category_id',cid,'name','SFx Special Shawarma','is_active',true,
    'variants',jsonb_build_array(jsonb_build_object('name','Regular','price',p_new_price,'is_active',true)),'addon_ids','[]'::jsonb));
   select id into variant_id from product_variants pv where pv.product_id=new_pid;
  end if;
  perform save_cost_recipe(jsonb_build_object('id',row->>'recipe_id','revision',row->'revision','name',row->>'name',
   'variant_id',variant_id,'inputs',row->'new_inputs'));
 end loop;
 insert into costing_imports(import_key,result,applied_by)values('2026-10-30-recipes',result,uid);
 perform log_activity('costing.workbook_update','costing_imports','2026-10-30-recipes',jsonb_build_object('source_sha256',source->>'sha256','menu_prices_preserved',true));
 return result||jsonb_build_object('already_applied',true);
end $$;
revoke all on function october_costing_update(boolean,text,numeric) from public,anon;
grant execute on function october_costing_update(boolean,text,numeric) to authenticated;
commit;
