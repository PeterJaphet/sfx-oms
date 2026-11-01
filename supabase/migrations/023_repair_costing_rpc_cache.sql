begin;
-- Rerunnable repair: install current RPC definitions and grants, then refresh PostgREST.
-- Does not apply any recipe import or change any saved recipe/price.
create or replace function november_extras_costing_update(p_apply boolean default false,p_token text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); source jsonb:=$source${"source_file":"SFx_Burger_Menu_Costing_and_PL EDITTED NEW (2).xlsx","sha256":"eb99cdea45e583b736108afed35af35d811227a3815764b7e94d2023a785a2b7","recipes":[{"name":"Chicken Lap","menu_name":"Chicken","addon":true,"source_sheet":"Extras","source_range":"A1:B26","inputs":{"ingredients":[{"name":"Chicken","cost":700},{"name":"Garlic and ginger paste","cost":100},{"name":"Curry","cost":10},{"name":"Black pepper","cost":5},{"name":"Bayleaf","cost":15},{"name":"Maggi","cost":5},{"name":"Thyme","cost":3},{"name":"Salt","cost":10},{"name":"Lezzet Bizim","cost":14}],"packaging":0,"overhead":80,"yield":11,"multiplier":2,"rounding":10,"planned_batches":0}},{"name":"Egg","menu_name":"Egg","addon":true,"source_sheet":"Extras","source_range":"A29:B46","inputs":{"ingredients":[{"name":"Eggs","cost":200}],"packaging":0,"overhead":80,"yield":30,"multiplier":2,"rounding":10,"planned_batches":0}},{"name":"Fish","menu_name":"Fish","addon":true,"source_sheet":"Extras","source_range":"A49:B72","inputs":{"ingredients":[{"name":"Fish","cost":300},{"name":"Onions","cost":10},{"name":"Curry","cost":10},{"name":"Salt","cost":5},{"name":"Maggie","cost":5},{"name":"Green Bell pepper","cost":10},{"name":"Salt","cost":10}],"packaging":0,"overhead":80,"yield":6,"multiplier":2,"rounding":10,"planned_batches":0}},{"name":"Ponmo","menu_name":"Ponmo","addon":true,"source_sheet":"Extras","source_range":"A75:B94","inputs":{"ingredients":[{"name":"ponmo","cost":200},{"name":"Maggie","cost":5},{"name":"Bizim lezzet","cost":15}],"packaging":0,"overhead":80,"yield":8,"multiplier":2,"rounding":10,"planned_batches":0}},{"name":"Shaki","menu_name":"Shaki","addon":true,"source_sheet":"Extras","source_range":"A97:B116","inputs":{"ingredients":[{"name":"Shaki","cost":200},{"name":"Maggie","cost":5},{"name":"Bizim Lezzet","cost":15}],"packaging":0,"overhead":80,"yield":8,"multiplier":2,"rounding":10,"planned_batches":0}},{"name":"Puff-puff","menu_name":"Puff-puff","addon":true,"source_sheet":"Extras","source_range":"A118:B140","inputs":{"ingredients":[{"name":"Flour","cost":210},{"name":"Sugar","cost":68},{"name":"Nutmeg","cost":10},{"name":"Yeast","cost":75},{"name":"Salt","cost":30},{"name":"Oil","cost":200}],"packaging":120,"overhead":80,"yield":50,"multiplier":2,"rounding":10,"planned_batches":0}},{"name":"Salad","menu_name":"Salad","addon":true,"source_sheet":"Extras","source_range":"A142:B165","inputs":{"ingredients":[{"name":"Cabbage","cost":70},{"name":"Carrot","cost":15},{"name":"Mayonnaise","cost":70},{"name":"Milk","cost":20},{"name":"Condensed milk","cost":20},{"name":"Black pepper","cost":5},{"name":"lemon sauce","cost":10}],"packaging":50,"overhead":80,"yield":10,"multiplier":2,"rounding":10,"planned_batches":0}},{"name":"Swallow","menu_name":"Swallow","addon":true,"source_sheet":"Extras","source_range":"A167:B184","inputs":{"ingredients":[{"name":"Semu","cost":100}],"packaging":20,"overhead":80,"yield":10,"multiplier":2,"rounding":10,"planned_batches":0}},{"name":"Turkey","menu_name":"Turkey","addon":true,"source_sheet":"Extras","source_range":"A186:B211","inputs":{"ingredients":[{"name":"Turkey","cost":550},{"name":"Garlic and ginger paste","cost":40},{"name":"Curry","cost":5},{"name":"Black pepper","cost":5},{"name":"Bayleaf","cost":5},{"name":"Maggi","cost":5},{"name":"Thyme","cost":3},{"name":"Salt","cost":5},{"name":"Lezzet Bizim","cost":10}],"packaging":0,"overhead":80,"yield":3,"multiplier":2,"rounding":10,"planned_batches":0}}]}$source$::jsonb;
 x jsonb; r cost_recipes; target uuid; n int; inputs jsonb; rows jsonb:='[]'; row jsonb;
 result jsonb; token text; existing jsonb; price numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('sfx-costing',0));
 select i.result into existing from costing_imports i where import_key='2026-11-01-extras';
 if found then return existing||jsonb_build_object('already_applied',true);end if;
 for x in select * from jsonb_array_elements(source->'recipes') loop
  target:=null;r:=null;price:=null;
  if (x->>'addon')::boolean then
   select count(*)into n from addons where lower(name) in(lower(x->>'menu_name'),lower(x->>'name'));
   if n>1 then raise exception 'More than one extra matches %; review the menu links before importing',x->>'name';end if;
   if n=0 and x->>'name'<>'Puff-puff' then raise exception 'Extra % was not found; review the menu before importing',x->>'menu_name';end if;
   select id,a.price into target,price from addons a where lower(name) in(lower(x->>'menu_name'),lower(x->>'name'));
   if target is null and x->>'name'='Puff-puff' then
    select count(*)into n from product_variants v join products p on p.id=v.product_id where lower(p.name)=lower(x->>'menu_name') and p.addon_id is null;
    if n>1 then raise exception 'More than one Puff-puff variant matches; review the recipe links first';end if;
    select v.id,v.price into target,price from product_variants v join products p on p.id=v.product_id where lower(p.name)=lower(x->>'menu_name') and p.addon_id is null;
    if target is not null then x:=x||'{"addon":false}'::jsonb;end if;
   end if;
  else
   select count(*)into n from product_variants v join products p on p.id=v.product_id where lower(p.name)=lower(x->>'menu_name');
   if n<>1 then raise exception 'Expected one Jollof Rice menu variant; review the menu links before importing';end if;
   select v.id,v.price into target,price from product_variants v join products p on p.id=v.product_id where lower(p.name)=lower(x->>'menu_name');
  end if;
  select count(*)into n from cost_recipes cr where lower(cr.name)=lower(x->>'name')
   or (case when (x->>'addon')::boolean then cr.addon_id=target else cr.variant_id=target end);
  if n>1 then raise exception 'More than one recipe matches %; review the recipe links first',x->>'name';end if;
  select * into r from cost_recipes cr where lower(cr.name)=lower(x->>'name')
   or (case when (x->>'addon')::boolean then cr.addon_id=target else cr.variant_id=target end);
  if r.id is not null and ((r.variant_id is not null and ((x->>'addon')::boolean or r.variant_id is distinct from target))
   or (r.addon_id is not null and (not (x->>'addon')::boolean or r.addon_id is distinct from target))) then
   raise exception 'Recipe % has a different menu link; review it before importing',r.name;
  end if;
  inputs:=coalesce(r.inputs,x->'inputs')||jsonb_build_object('ingredients',x->'inputs'->'ingredients',
   'packaging',x->'inputs'->'packaging','overhead',x->'inputs'->'overhead','yield',x->'inputs'->'yield');
  perform costing_recipe_math(inputs);
  rows:=rows||jsonb_build_array(jsonb_build_object('name',coalesce(r.name,x->>'name'),'menu_name',x->>'menu_name',
   'recipe_id',r.id,'revision',r.revision,'target_id',target,'addon',(x->>'addon')::boolean,'menu_price',price,
   'current_inputs',r.inputs,'new_inputs',inputs,'current_unit_cost',case when r.id is not null then costing_recipe_math(r.inputs)->'unit_full_cost' end,
   'new_unit_cost',costing_recipe_math(inputs)->'unit_full_cost','new_unit_cogs',costing_recipe_math(inputs)->'unit_cogs','new_unit_overhead',costing_recipe_math(inputs)->'unit_overhead','planning_only',target is null));
 end loop;
 token:=encode(sha256(convert_to(rows::text,'UTF8')),'hex');
 result:=jsonb_build_object('rows',rows,'token',token,'already_applied',false,'source_sha256',source->>'sha256');
 if not coalesce(p_apply,false) then return result;end if;
 if p_token is distinct from token then raise exception 'Costing or menu details changed; reload the update preview';end if;
 for row in select * from jsonb_array_elements(rows) loop
  perform save_cost_recipe(jsonb_build_object('id',row->>'recipe_id','revision',row->'revision','name',row->>'name',
   'variant_id',case when not (row->>'addon')::boolean then row->>'target_id' end,
   'addon_id',case when (row->>'addon')::boolean then row->>'target_id' end,'inputs',row->'new_inputs'));
 end loop;
 insert into costing_imports(import_key,result,applied_by)values('2026-11-01-extras',result,uid);
 perform log_activity('costing.workbook_update','costing_imports','2026-11-01-extras',jsonb_build_object('source_sha256',source->>'sha256','menu_prices_preserved',true));
 return result||jsonb_build_object('already_applied',true);
end $$;
revoke all on function november_extras_costing_update(boolean,text) from public,anon;
grant execute on function november_extras_costing_update(boolean,text) to authenticated;
create or replace function november_dishes_costing_update(p_apply boolean default false,p_token text default null,p_new_price numeric default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); source jsonb:=$source${"source_file":"SFx_Burger_Menu_Costing_and_PL EDITTED NEW (2).xlsx","sha256":"eb99cdea45e583b736108afed35af35d811227a3815764b7e94d2023a785a2b7","recipes":[{"name":"Village Rice","menu_name":"Native Rice + Chicken","source_sheet":"Rice & Soup","source_range":"A38:B63","inputs":{"ingredients":[{"name":"Rice (1.5Kg)","cost":138},{"name":"Red long bell pepper","cost":400},{"name":"Hot pepper","cost":40},{"name":"Palm oil","cost":100},{"name":"Onions","cost":10},{"name":"Spinach","cost":74},{"name":"Tuzzot","cost":20},{"name":"Crayfish","cost":100},{"name":"Maggie","cost":10},{"name":"Chicken","cost":225},{"name":"Shaki and ponmo","cost":300}],"packaging":200,"overhead":0,"yield":7,"multiplier":2.14,"rounding":10,"planned_batches":0}},{"name":"Jollof Rice","menu_name":"Jollof Rice + Chicken","source_sheet":"Rice & Soup","source_range":"A67:B97","inputs":{"ingredients":[{"name":"Rice (2.8Kg)","cost":258},{"name":"Red long bell pepper","cost":345},{"name":"Hot pepper","cost":60},{"name":"Green bell pepper","cost":10},{"name":"Onions","cost":10},{"name":"Oil","cost":70},{"name":"Sweet Pepper paste","cost":63},{"name":"Hot pepper paste","cost":63},{"name":"Tomato paste","cost":50},{"name":"Ginger and garlic paste","cost":250},{"name":"Curry","cost":50},{"name":"Tuzzot","cost":15},{"name":"Thyme","cost":10},{"name":"Maggie","cost":63},{"name":"Black Pepper","cost":20},{"name":"Chicken","cost":350}],"packaging":360,"overhead":0,"yield":12,"multiplier":2,"rounding":10,"planned_batches":0}},{"name":"Vegetable Soup","menu_name":"Vegetable Soup","source_sheet":"Rice & Soup","source_range":"A101:B125","inputs":{"ingredients":[{"name":"Red long bell pepper","cost":230},{"name":"Hot pepper","cost":40},{"name":"Onions","cost":10},{"name":"Palm oil","cost":100},{"name":"Spinach","cost":75},{"name":"Tuzzot","cost":15},{"name":"Maggie","cost":8},{"name":"Shaki and ponmo","cost":150},{"name":"Crayfish","cost":50},{"name":"Chicken","cost":0}],"packaging":115,"overhead":0,"yield":5,"multiplier":2.15,"rounding":10,"planned_batches":0}},{"name":"SFx Special Shawarma","menu_name":"SFx Special Shawarma","source_sheet":"Fast Food","source_range":"A180:B213","inputs":{"ingredients":[{"name":"Chicken","cost":300},{"name":"Sweet pepper","cost":7},{"name":"Plantain","cost":30.0},{"name":"Garlic and ginger paste","cost":200},{"name":"Mustard","cost":20},{"name":"Black pepper","cost":5},{"name":"Red long bell pepper","cost":10},{"name":"Green bell pepper","cost":10},{"name":"Hot pepper powder","cost":7},{"name":"Onions powder","cost":5},{"name":"Maggie","cost":3.0},{"name":"Salt","cost":10},{"name":"Condensed milk","cost":20},{"name":"Onion, cabbage and carrot","cost":65},{"name":"Mayonnaise","cost":250},{"name":"Ketchup","cost":0},{"name":"Milk","cost":14},{"name":"Oil","cost":10},{"name":"Shawarma bread","cost":72}],"packaging":100,"overhead":0,"yield":4,"multiplier":2,"rounding":10,"planned_batches":0}}]}$source$::jsonb;
 x jsonb; r cost_recipes; v product_variants; n int; inputs jsonb; rows jsonb:='[]'; row jsonb;
 result jsonb; token text; new_pid uuid; variant_id uuid; cid smallint; existing jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('sfx-costing',0));
 select i.result into existing from costing_imports i where import_key='2026-11-01-dishes';
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
 insert into costing_imports(import_key,result,applied_by)values('2026-11-01-dishes',result,uid);
 perform log_activity('costing.workbook_update','costing_imports','2026-11-01-dishes',jsonb_build_object('source_sha256',source->>'sha256','menu_prices_preserved',true));
 return result||jsonb_build_object('already_applied',true);
end $$;
revoke all on function november_dishes_costing_update(boolean,text,numeric) from public,anon;
grant execute on function november_dishes_costing_update(boolean,text,numeric) to authenticated;
create or replace function october_costing_update(p_apply boolean default false,p_token text default null,p_new_price numeric default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); source jsonb:=$source${"source_file":"SFx_Burger_Menu_Costing_and_PL EDITTED NEW.xlsx","sha256":"4441900fd10cd4485fedbd05b91525d732429da376d4c2c09ab619797a914914","recipes":[{"name":"Village Rice","menu_name":"Native Rice + Chicken","source_sheet":"Rice & Soup","source_range":"A38:B63","inputs":{"ingredients":[{"name":"Rice (1.5Kg)","cost":138.0},{"name":"Red long bell pepper","cost":400.0},{"name":"Hot pepper","cost":40.0},{"name":"Palm oil","cost":100.0},{"name":"Onions","cost":10.0},{"name":"Spinach","cost":74.0},{"name":"Tuzzot","cost":20.0},{"name":"Crayfish","cost":100.0},{"name":"Maggie","cost":10.0},{"name":"Chicken","cost":100.0},{"name":"Shaki and ponmo","cost":300.0}],"packaging":100,"overhead":0,"yield":7,"multiplier":2.14,"rounding":10,"planned_batches":0}},{"name":"Jollof Rice","menu_name":"Jollof Rice + Chicken","source_sheet":"Rice & Soup","source_range":"A67:B97","inputs":{"ingredients":[{"name":"Rice (2.8Kg)","cost":258.0},{"name":"Red long bell pepper","cost":345.0},{"name":"Hot pepper","cost":60.0},{"name":"Green bell pepper","cost":10.0},{"name":"Onions","cost":10.0},{"name":"Oil","cost":70.0},{"name":"Sweet Pepper paste","cost":63.0},{"name":"Hot pepper paste","cost":63.0},{"name":"Tomato paste","cost":50.0},{"name":"Ginger and garlic paste","cost":250.0},{"name":"Curry","cost":50.0},{"name":"Tuzzot","cost":15.0},{"name":"Thyme","cost":10.0},{"name":"Maggie","cost":63.0},{"name":"Black Pepper","cost":20.0},{"name":"Chicken","cost":100.0}],"packaging":100,"overhead":0,"yield":12,"multiplier":2,"rounding":10,"planned_batches":0}},{"name":"Vegetable Soup","menu_name":"Vegetable Soup","source_sheet":"Rice & Soup","source_range":"A101:B125","inputs":{"ingredients":[{"name":"Red long bell pepper","cost":230.0},{"name":"Hot pepper","cost":40.0},{"name":"Onions","cost":10.0},{"name":"Palm oil","cost":100.0},{"name":"Spinach","cost":75.0},{"name":"Tuzzot","cost":15.0},{"name":"Maggie","cost":8.0},{"name":"Shaki and ponmo","cost":150.0},{"name":"Crayfish","cost":50.0},{"name":"Chicken","cost":0.0}],"packaging":100,"overhead":0,"yield":5,"multiplier":2.15,"rounding":10,"planned_batches":0}},{"name":"SFx Special Shawarma","menu_name":"SFx Special Shawarma","source_sheet":"Fast Food","source_range":"A180:B212","inputs":{"ingredients":[{"name":"Chicken","cost":300.0},{"name":"Sweet pepper","cost":7.0},{"name":"Plantain","cost":30.0},{"name":"Garlic and ginger paste","cost":200.0},{"name":"Mustard","cost":20.0},{"name":"Black pepper","cost":5.0},{"name":"Red long bell pepper","cost":10.0},{"name":"Green bell pepper","cost":10.0},{"name":"Hot pepper powder","cost":7.0},{"name":"Onions powder","cost":5.0},{"name":"Maggie","cost":3.0},{"name":"Salt","cost":10.0},{"name":"Onion, cabbage and carrot","cost":65.0},{"name":"Mayonnaise","cost":250.0},{"name":"Ketchup","cost":0.0},{"name":"Milk","cost":14.0},{"name":"Oil","cost":10.0},{"name":"Shawarma bread","cost":72.0}],"packaging":100,"overhead":0,"yield":4,"multiplier":2,"rounding":10,"planned_batches":0}}]}$source$::jsonb;
 x jsonb; r cost_recipes; v product_variants; n int; inputs jsonb; rows jsonb:='[]'; row jsonb;
 result jsonb; token text; new_pid uuid; variant_id uuid; cid smallint; existing jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('sfx-costing',0));
 select i.result into existing from costing_imports i where import_key='2026-10-30-recipes';
 if found then return existing||jsonb_build_object('already_applied',true);end if;
 if exists(select 1 from costing_imports where import_key='2026-11-01-dishes') then raise exception 'The newer 1 November dish update is applied; do not apply this older update';end if;
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
create or replace function october31_costing_update(p_apply boolean default false,p_token text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); source jsonb:=$source${"source_file":"SFx_Burger_Menu_Costing_and_PL EDITTED NEW (1).xlsx","sha256":"69a8e016a71eef0e422a3d1e41e517d0bd5becef3273af6241966d04df72b9c4","recipes":[{"name":"Jollof Rice","menu_name":"Jollof Rice + Chicken","source_sheet":"Rice & Soup","source_range":"A67:B97","inputs":{"ingredients":[{"name":"Rice (2.8Kg)","cost":258.0},{"name":"Red long bell pepper","cost":345.0},{"name":"Hot pepper","cost":60.0},{"name":"Green bell pepper","cost":10.0},{"name":"Onions","cost":10.0},{"name":"Oil","cost":70.0},{"name":"Sweet Pepper paste","cost":63.0},{"name":"Hot pepper paste","cost":63.0},{"name":"Tomato paste","cost":50.0},{"name":"Ginger and garlic paste","cost":250.0},{"name":"Curry","cost":50.0},{"name":"Tuzzot","cost":15.0},{"name":"Thyme","cost":10.0},{"name":"Maggie","cost":63.0},{"name":"Black Pepper","cost":20.0},{"name":"Chicken","cost":700}],"packaging":100,"overhead":0,"yield":12,"multiplier":2,"rounding":10,"planned_batches":0},"addon":false},{"name":"Chicken Lap","menu_name":"Chicken","addon":true,"source_sheet":"Extras","source_range":"A1:B26","inputs":{"ingredients":[{"name":"Chicken","cost":700},{"name":"Garlic and ginger paste","cost":10},{"name":"Curry","cost":10},{"name":"Black pepper","cost":5},{"name":"Bayleaf","cost":7},{"name":"Maggi","cost":15},{"name":"Thyme","cost":3},{"name":"Salt","cost":10},{"name":"Lezzet Bizim","cost":14}],"packaging":120,"overhead":80,"yield":4,"multiplier":2,"rounding":10,"planned_batches":0}}],"withheld_extras":["Egg","Fish","Ponmo","Shaki","Puff-puff","Salad","Swallow","Turkey"]}$source$::jsonb;
 x jsonb; r cost_recipes; target uuid; n int; inputs jsonb; rows jsonb:='[]'; row jsonb;
 result jsonb; token text; existing jsonb; price numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('sfx-costing',0));
 select i.result into existing from costing_imports i where import_key='2026-10-31-recipes';
 if found then return existing||jsonb_build_object('already_applied',true);end if;
 if exists(select 1 from costing_imports where import_key='2026-11-01-dishes') then raise exception 'The newer 1 November dish update is applied; do not apply this older update';end if;
 if exists(select 1 from costing_imports where import_key='2026-11-01-extras') then
  raise exception 'The newer 1 November extras update is applied; do not apply the older 31 October update';
 end if;
 -- Prevent an unapplied older import from subsequently restoring older Jollof costs.
 if not exists(select 1 from costing_imports where import_key='2026-10-30-recipes') then
  raise exception 'Apply the 30 October food costing update first, then review the 31 October update';
 end if;
 for x in select * from jsonb_array_elements(source->'recipes') loop
  target:=null;r:=null;price:=null;
  if (x->>'addon')::boolean then
   select count(*)into n from addons where lower(name) in(lower(x->>'menu_name'),lower(x->>'name'));
   if n<>1 then raise exception 'Expected one Chicken extra; review the menu links before importing';end if;
   select id,a.price into target,price from addons a where lower(name) in(lower(x->>'menu_name'),lower(x->>'name'));
  else
   select count(*)into n from product_variants v join products p on p.id=v.product_id where lower(p.name)=lower(x->>'menu_name');
   if n<>1 then raise exception 'Expected one Jollof Rice menu variant; review the menu links before importing';end if;
   select v.id,v.price into target,price from product_variants v join products p on p.id=v.product_id where lower(p.name)=lower(x->>'menu_name');
  end if;
  select count(*)into n from cost_recipes cr where lower(cr.name)=lower(x->>'name')
   or (case when (x->>'addon')::boolean then cr.addon_id=target else cr.variant_id=target end);
  if n>1 then raise exception 'More than one recipe matches %; review the recipe links first',x->>'name';end if;
  select * into r from cost_recipes cr where lower(cr.name)=lower(x->>'name')
   or (case when (x->>'addon')::boolean then cr.addon_id=target else cr.variant_id=target end);
  if r.id is not null and ((r.variant_id is not null and ((x->>'addon')::boolean or r.variant_id<>target))
   or (r.addon_id is not null and (not (x->>'addon')::boolean or r.addon_id<>target))) then
   raise exception 'Recipe % has a different menu link; review it before importing',r.name;
  end if;
  inputs:=coalesce(r.inputs,x->'inputs')||jsonb_build_object('ingredients',x->'inputs'->'ingredients',
   'packaging',x->'inputs'->'packaging','overhead',x->'inputs'->'overhead','yield',x->'inputs'->'yield');
  perform costing_recipe_math(inputs);
  rows:=rows||jsonb_build_array(jsonb_build_object('name',coalesce(r.name,x->>'name'),'menu_name',x->>'menu_name',
   'recipe_id',r.id,'revision',r.revision,'target_id',target,'addon',(x->>'addon')::boolean,'menu_price',price,
   'current_inputs',r.inputs,'new_inputs',inputs,'current_unit_cost',case when r.id is not null then costing_recipe_math(r.inputs)->'unit_full_cost' end,
   'new_unit_cost',costing_recipe_math(inputs)->'unit_full_cost'));
 end loop;
 token:=encode(sha256(convert_to(rows::text,'UTF8')),'hex');
 result:=jsonb_build_object('rows',rows,'token',token,'already_applied',false,'source_sha256',source->>'sha256');
 if not coalesce(p_apply,false) then return result;end if;
 if p_token is distinct from token then raise exception 'Costing or menu details changed; reload the update preview';end if;
 for row in select * from jsonb_array_elements(rows) loop
  perform save_cost_recipe(jsonb_build_object('id',row->>'recipe_id','revision',row->'revision','name',row->>'name',
   'variant_id',case when not (row->>'addon')::boolean then row->>'target_id' end,
   'addon_id',case when (row->>'addon')::boolean then row->>'target_id' end,'inputs',row->'new_inputs'));
 end loop;
 insert into costing_imports(import_key,result,applied_by)values('2026-10-31-recipes',result,uid);
 perform log_activity('costing.workbook_update','costing_imports','2026-10-31-recipes',jsonb_build_object('source_sha256',source->>'sha256','menu_prices_preserved',true));
 return result||jsonb_build_object('already_applied',true);
end $$;

notify pgrst, 'reload schema';
commit;
