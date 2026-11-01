begin;
-- Preview and apply corrected extras from the 1 November workbook.
-- Installation alone never changes recipe data or published prices.
create function november_extras_costing_update(p_apply boolean default false,p_token text default null)
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
create or replace function october31_costing_update(p_apply boolean default false,p_token text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); source jsonb:=$source${"source_file":"SFx_Burger_Menu_Costing_and_PL EDITTED NEW (1).xlsx","sha256":"69a8e016a71eef0e422a3d1e41e517d0bd5becef3273af6241966d04df72b9c4","recipes":[{"name":"Jollof Rice","menu_name":"Jollof Rice + Chicken","source_sheet":"Rice & Soup","source_range":"A67:B97","inputs":{"ingredients":[{"name":"Rice (2.8Kg)","cost":258.0},{"name":"Red long bell pepper","cost":345.0},{"name":"Hot pepper","cost":60.0},{"name":"Green bell pepper","cost":10.0},{"name":"Onions","cost":10.0},{"name":"Oil","cost":70.0},{"name":"Sweet Pepper paste","cost":63.0},{"name":"Hot pepper paste","cost":63.0},{"name":"Tomato paste","cost":50.0},{"name":"Ginger and garlic paste","cost":250.0},{"name":"Curry","cost":50.0},{"name":"Tuzzot","cost":15.0},{"name":"Thyme","cost":10.0},{"name":"Maggie","cost":63.0},{"name":"Black Pepper","cost":20.0},{"name":"Chicken","cost":700}],"packaging":100,"overhead":0,"yield":12,"multiplier":2,"rounding":10,"planned_batches":0},"addon":false},{"name":"Chicken Lap","menu_name":"Chicken","addon":true,"source_sheet":"Extras","source_range":"A1:B26","inputs":{"ingredients":[{"name":"Chicken","cost":700},{"name":"Garlic and ginger paste","cost":10},{"name":"Curry","cost":10},{"name":"Black pepper","cost":5},{"name":"Bayleaf","cost":7},{"name":"Maggi","cost":15},{"name":"Thyme","cost":3},{"name":"Salt","cost":10},{"name":"Lezzet Bizim","cost":14}],"packaging":120,"overhead":80,"yield":4,"multiplier":2,"rounding":10,"planned_batches":0}}],"withheld_extras":["Egg","Fish","Ponmo","Shaki","Puff-puff","Salad","Swallow","Turkey"]}$source$::jsonb;
 x jsonb; r cost_recipes; target uuid; n int; inputs jsonb; rows jsonb:='[]'; row jsonb;
 result jsonb; token text; existing jsonb; price numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('sfx-costing',0));
 select i.result into existing from costing_imports i where import_key='2026-10-31-recipes';
 if found then return existing||jsonb_build_object('already_applied',true);end if;
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

commit;
