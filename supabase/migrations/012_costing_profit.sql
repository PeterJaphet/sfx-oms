-- M14: Admin recipe costing, workbook planning, immutable order estimates.
-- Existing schema.sql, money/report maths, RLS and legacy order RPCs are preserved.
begin;
create table cost_recipes (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 variant_id uuid unique references product_variants(id), addon_id uuid unique references addons(id),
 inputs jsonb not null, revision int not null default 1,
 updated_by uuid references profiles(id), updated_at timestamptz not null default now(),
 check(variant_id is null or addon_id is null)
);
create table cost_plan (
 id boolean primary key default true check(id), inputs jsonb not null,
 revision int not null default 1, updated_by uuid references profiles(id), updated_at timestamptz not null default now()
);
insert into cost_plan(inputs) values('{"rent_usd":550,"payroll_usd":700,"usd_rate":47.9,"weekly_fixed":[{"name":"Marketing & promotions","cost":0},{"name":"Phone & internet","cost":0},{"name":"Equipment maintenance","cost":0},{"name":"Licences & permits","cost":0},{"name":"Bank / payment fees","cost":0},{"name":"Miscellaneous","cost":0}],"scenarios":[44,47.9,52,57,62]}');
create table costing_history (
 id bigint generated always as identity primary key, entity text not null, entity_id text not null,
 snapshot jsonb not null, changed_by uuid not null references profiles(id), changed_at timestamptz not null default now()
);
create table order_cost_snapshots (
 order_id uuid primary key references orders(id), estimate jsonb not null,
 created_by uuid not null references profiles(id), created_at timestamptz not null default now()
);
alter table cost_recipes enable row level security;
alter table cost_plan enable row level security;
alter table costing_history enable row level security;
alter table order_cost_snapshots enable row level security;
create policy read_costing on cost_recipes for select to authenticated using(app_role() in('operations','admin'));
create policy read_costing on cost_plan for select to authenticated using(app_role() in('operations','admin'));
create policy read_costing on costing_history for select to authenticated using(app_role()='admin');
create policy read_costing on order_cost_snapshots for select to authenticated using(app_role() in('operations','admin'));
grant select on cost_recipes,cost_plan,costing_history,order_cost_snapshots to authenticated;
create trigger no_delete before delete on cost_recipes for each row execute function trg_no_delete();
create trigger no_delete before delete on cost_plan for each row execute function trg_no_delete();
create trigger no_delete before delete on costing_history for each row execute function trg_no_delete();
create trigger no_delete before delete on order_cost_snapshots for each row execute function trg_no_delete();
create function costing_immutable() returns trigger language plpgsql as $$
begin raise exception 'Costing history and saved estimates are permanent'; end $$;
create trigger immutable before update on costing_history for each row execute function costing_immutable();
create trigger immutable before update on order_cost_snapshots for each row execute function costing_immutable();

create function costing_number(p jsonb,p_name text,p_min numeric default 0,p_max numeric default 9999999999.99,p_scale int default 2)
returns numeric language plpgsql immutable set search_path=public,pg_catalog as $$
declare v numeric;
begin
 if jsonb_typeof(p->p_name) is distinct from 'number' then raise exception 'Enter a number for %',p_name; end if;
 v:=(p->>p_name)::numeric;
 if v::text in('NaN','Infinity','-Infinity') or v<p_min or v>p_max or v<>round(v,p_scale) then
  raise exception 'Invalid value for %',p_name;
 end if;
 return v;
end $$;
create function costing_lines(p jsonb) returns numeric language plpgsql immutable set search_path=public,pg_catalog as $$
declare x jsonb; total numeric:=0;
begin
 if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p)>100 then raise exception 'Costs must be a list of at most 100 lines'; end if;
 for x in select * from jsonb_array_elements(p) loop
  if nullif(trim(x->>'name'),'') is null or length(x->>'name')>120 then raise exception 'Give each cost a name'; end if;
  total:=total+costing_number(x,'cost');
 end loop;
 return total;
end $$;
create function costing_recipe_math(p jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_catalog as $$
declare ing numeric; pack numeric; op numeric; y numeric; mult numeric; rounding numeric; batches numeric; cogs numeric; full_cost numeric; selling numeric;
begin
 ing:=costing_lines(p->'ingredients');
 if jsonb_array_length(p->'ingredients')=0 then raise exception 'Add an ingredient cost; enter 0 explicitly for a zero-cost recipe'; end if;
 pack:=costing_number(p,'packaging');op:=costing_number(p,'overhead');
 y:=costing_number(p,'yield',1,9999,0);mult:=costing_number(p,'multiplier',0.000001,1000,6);
 rounding:=costing_number(p,'rounding',0.01,1000);batches:=costing_number(p,'planned_batches',0,999999,2);
 cogs:=ing+pack;full_cost:=cogs+op;selling:=full_cost*mult;
 if ceil(selling/y/rounding)*rounding>9999999999.99 then raise exception 'Suggested selling price is too large'; end if;
 return jsonb_build_object('ingredients',ing,'cogs',cogs,'overhead',op,'full_cost',full_cost,'selling_batch',selling,
  'gross_profit_batch',selling-cogs,'contribution_batch',selling-full_cost,'yield',y,'multiplier',mult,'planned_batches',batches,
  'unit_cogs',cogs/y,'unit_overhead',op/y,'unit_full_cost',full_cost/y,'price_per_unit',selling/y,
  'gross_profit_per_unit',(selling-cogs)/y,'planned_units',batches*y,'weekly_revenue',batches*selling,'weekly_cogs',batches*cogs,'weekly_gross_profit',batches*(selling-cogs),'weekly_overhead',batches*op,'weekly_ingredients',batches*ing,'suggested_price',ceil(selling/y/rounding)*rounding,
  'gross_margin',case when selling>0 then (selling-cogs)/selling end,
  'food_cost_ratio',case when selling>0 then ing/selling end);
end $$;
create function costing_plan_math(p jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare rent numeric; payroll numeric; rate numeric; fixed_other numeric; fixed numeric; revenue numeric:=0; cogs numeric:=0;
 overhead numeric:=0; ingredients numeric:=0; batches numeric:=0; units numeric:=0; r record; m jsonb; n numeric; s jsonb; scenarios jsonb:='[]'; sf numeric;
begin
 rent:=costing_number(p,'rent_usd');payroll:=costing_number(p,'payroll_usd');rate:=costing_number(p,'usd_rate',0.000001,999999,6);
 fixed_other:=costing_lines(p->'weekly_fixed');fixed:=(rent+payroll)*rate/(52::numeric/12)+fixed_other;
 for r in select * from cost_recipes order by id loop
  m:=costing_recipe_math(r.inputs);n:=(m->>'planned_batches')::numeric;
  revenue:=revenue+n*(m->>'selling_batch')::numeric;cogs:=cogs+n*(m->>'cogs')::numeric;
  overhead:=overhead+n*(m->>'overhead')::numeric;ingredients:=ingredients+n*(m->>'ingredients')::numeric;
  batches:=batches+n;units:=units+n*(m->>'yield')::numeric;
 end loop;
 if jsonb_typeof(p->'scenarios') is distinct from 'array' or jsonb_array_length(p->'scenarios') not between 1 and 10 then raise exception 'Enter 1 to 10 exchange-rate scenarios'; end if;
 for s in select * from jsonb_array_elements(p->'scenarios') loop
  n:=costing_number(jsonb_build_object('rate',s),'rate',0.000001,999999,6);
  sf:=(rent+payroll)*n/(52::numeric/12)+fixed_other;
  scenarios:=scenarios||jsonb_build_array(jsonb_build_object('rate',n,'fixed',sf,'net_profit',revenue-cogs-overhead-sf,
   'net_margin',case when revenue>0 then (revenue-cogs-overhead-sf)/revenue end,
   'break_even',case when revenue-cogs-overhead>0 then sf/((revenue-cogs-overhead)/revenue) end));
 end loop;
 return jsonb_build_object('revenue',revenue,'cogs',cogs,'ingredients',ingredients,'gross_profit',revenue-cogs,'overhead',overhead,
  'fixed',fixed,'rent_weekly',rent*rate/(52::numeric/12),'payroll_weekly',payroll*rate/(52::numeric/12),'weekly_fixed_other',fixed_other,
  'net_profit',revenue-cogs-overhead-fixed,'batches',batches,'units',units,'weeks_per_month',52::numeric/12,
  'fixed_ratio',case when fixed=0 then 0 when revenue>0 then fixed/revenue end,
  'gross_margin',case when revenue>0 then (revenue-cogs)/revenue end,
  'net_margin',case when revenue>0 then (revenue-cogs-overhead-fixed)/revenue end,
  'contribution',revenue-cogs-overhead,'contribution_ratio',case when revenue>0 then (revenue-cogs-overhead)/revenue end,
  'break_even',case when revenue-cogs-overhead>0 then fixed/((revenue-cogs-overhead)/revenue) end,'scenarios',scenarios);
end $$;

create function preview_cost_recipe(p jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin');begin return costing_recipe_math(p);end $$;
create function preview_cost_plan(p jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin');begin return costing_plan_math(p);end $$;
create function save_cost_recipe(p jsonb) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); r cost_recipes; rid uuid:=nullif(p->>'id','')::uuid; vid uuid:=nullif(p->>'variant_id','')::uuid; aid uuid:=nullif(p->>'addon_id','')::uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('sfx-costing',0));
 perform costing_recipe_math(p->'inputs');
 if nullif(trim(p->>'name'),'') is null or length(p->>'name')>120 then raise exception 'Enter a recipe name'; end if;
 if vid is not null and aid is not null then raise exception 'Link a dish variant or an extra, not both'; end if;
 if vid is not null and exists(select 1 from product_variants v join products pr on pr.id=v.product_id where v.id=vid and pr.addon_id is not null) then raise exception 'Cost a standalone extra through its extra link';end if;
 if rid is null then
  insert into cost_recipes(name,variant_id,addon_id,inputs,updated_by) values(trim(p->>'name'),vid,aid,p->'inputs',uid) returning * into r;
 else
  select * into r from cost_recipes where id=rid for update;
  if r.id is null then raise exception 'Recipe not found'; end if;
  if (p->>'revision')::int is distinct from r.revision then raise exception 'Recipe changed; reload before saving'; end if;
  update cost_recipes set name=trim(p->>'name'),variant_id=vid,addon_id=aid,inputs=p->'inputs',revision=revision+1,updated_by=uid,updated_at=now() where id=rid returning * into r;
 end if;
 insert into costing_history(entity,entity_id,snapshot,changed_by) values('recipe',r.id::text,to_jsonb(r),uid);
 perform log_activity('costing.recipe','cost_recipes',r.id::text,jsonb_build_object('name',r.name,'revision',r.revision));
 return r.id;
end $$;
create function save_cost_plan(p jsonb,p_revision int) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin'); r cost_plan;
begin
 perform pg_advisory_xact_lock(hashtextextended('sfx-costing',0));perform costing_plan_math(p);
 select * into r from cost_plan for update;
 if p_revision is distinct from r.revision then raise exception 'Planning inputs changed; reload before saving';end if;
 update cost_plan set inputs=p,revision=revision+1,updated_by=uid,updated_at=now() returning * into r;
 insert into costing_history(entity,entity_id,snapshot,changed_by)values('plan','true',to_jsonb(r),uid);
 perform log_activity('costing.plan','cost_plan','true',jsonb_build_object('revision',r.revision));
end $$;
create function apply_cost_price(p_recipe uuid,p_revision int,p_price numeric) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin');r cost_recipes;suggested numeric;current_price numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('sfx-costing',0));select * into r from cost_recipes where id=p_recipe for update;
 if r.id is null or p_revision is distinct from r.revision then raise exception 'Recipe changed; reload before applying its price';end if;
 suggested:=(costing_recipe_math(r.inputs)->>'suggested_price')::numeric;
 if r.variant_id is not null then
  select v.price into current_price from product_variants v join products pr on pr.id=v.product_id join product_categories c on c.id=pr.category_id
   where v.id=r.variant_id and v.is_active and pr.is_active and c.is_active for update of v;
 elsif r.addon_id is not null then select a.price into current_price from addons a where a.id=r.addon_id and a.is_active for update;
 else raise exception 'Link this recipe to a menu variant or extra first';end if;
 if current_price is null then raise exception 'The linked menu item is inactive';end if;
 if p_price is distinct from current_price then raise exception 'Menu price changed; reload before applying its price';end if;
 if r.variant_id is not null then update product_variants set price=suggested where id=r.variant_id;
 else update addons set price=suggested where id=r.addon_id;end if;
 perform log_activity('costing.apply_price','cost_recipes',r.id::text,jsonb_build_object('old_price',current_price,'new_price',suggested,'revision',r.revision));
end $$;
create function get_costing(p_from date default null,p_to date default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin');r cost_plan;recipes jsonb;d date:=coalesce(p_from,date_trunc('week',business_date())::date);t date;actual numeric;math jsonb;
begin
 t:=coalesce(p_to,d+6);if t<>d+6 or extract(isodow from d)<>1 then raise exception 'Choose a Monday to Sunday week for the overhead comparison';end if;
 select * into r from cost_plan;math:=costing_plan_math(r.inputs);
 select coalesce(jsonb_agg(to_jsonb(cr)||jsonb_build_object('math',costing_recipe_math(cr.inputs),'current_price',coalesce(pv.price,a.price)) order by cr.name),'[]')
 into recipes from cost_recipes cr left join product_variants pv on pv.id=cr.variant_id left join addons a on a.id=cr.addon_id;
 select coalesce(sum(amount_try),0) into actual from v_expenses where kind='operational' and business_date between d and t;
 return jsonb_build_object('recipes',recipes,'plan',to_jsonb(r),'math',math,'from',d,'to',t,'business_date',business_date(),'generated_at',now(),'actual_operational',actual,
  'recovered_operational',math->'overhead','operational_shortfall',actual-(math->>'overhead')::numeric,
  'actual_per_planned_batch',case when (math->>'batches')::numeric>0 then actual/(math->>'batches')::numeric end,
  'history',(select coalesce(jsonb_agg(x order by x.id desc),'[]') from(select h.*,pr.full_name as staff from costing_history h join profiles pr on pr.id=h.changed_by order by h.id desc limit 50)x));
end $$;

create function costing_order_math(q jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare it jsonb;x jsonb;r cost_recipes;p cost_plan;m jsonb;pm jsonb;cogs numeric:=0;op numeric:=0;cnt numeric;cost numeric;
 missing jsonb:='[]';components jsonb:='[]';rev numeric:=(q->>'total')::numeric;gross numeric;fixed numeric;net numeric;recipe_state jsonb;
begin
 select * into p from cost_plan;pm:=costing_plan_math(p.inputs);
 for it in select * from jsonb_array_elements(q->'items') loop
  select cr.* into r from cost_recipes cr where cr.variant_id=(it->>'variant_id')::uuid or cr.addon_id=(select addon_id from products where id=(it->>'product_id')::uuid);
  if r.id is null then missing:=missing||jsonb_build_array((it->>'product_name')||' · '||(it->>'variant_name'));
  else
   m:=costing_recipe_math(r.inputs);cnt:=(it->>'quantity')::numeric;cogs:=cogs+cnt*(m->>'unit_cogs')::numeric;op:=op+cnt*(m->>'unit_overhead')::numeric;
   components:=components||jsonb_build_array(jsonb_build_object('name',it->>'product_name','quantity',cnt,'recipe',to_jsonb(r),'cogs',cnt*(m->>'unit_cogs')::numeric,'overhead',cnt*(m->>'unit_overhead')::numeric));
  end if;
  for x in select * from jsonb_array_elements(it->'addons') loop
   cnt:=coalesce((x->>'quantity')::numeric,(it->>'quantity')::numeric);
   select * into r from cost_recipes where addon_id=(x->>'addon_id')::uuid;
   if r.id is null then missing:=missing||jsonb_build_array(x->>'name');
   else
    m:=costing_recipe_math(r.inputs);cogs:=cogs+cnt*(m->>'unit_cogs')::numeric;op:=op+cnt*(m->>'unit_overhead')::numeric;
    components:=components||jsonb_build_array(jsonb_build_object('name',x->>'name','quantity',cnt,'recipe',to_jsonb(r),'cogs',cnt*(m->>'unit_cogs')::numeric,'overhead',cnt*(m->>'unit_overhead')::numeric));
   end if;
  end loop;
 end loop;
 select coalesce(jsonb_agg(value order by value),'[]') into missing from(select distinct value from jsonb_array_elements(missing))x;
 select coalesce(jsonb_agg(value order by value::text),'[]') into components from jsonb_array_elements(components);
 fixed:=round(rev*(pm->>'fixed_ratio')::numeric,2);
 if jsonb_array_length(missing)=0 then cogs:=round(cogs,2);op:=round(op,2);gross:=rev-cogs;net:=gross-op-fixed;
 else cogs:=null;op:=null;end if;
 -- Track ALL forecast recipes: even unchanged forecast revenue must not conceal an edit to its inputs.
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision) order by id),'[]') into recipe_state from cost_recipes;
 return jsonb_build_object('revenue',rev,'cogs',cogs,'gross_profit',gross,'operational',op,'fixed',fixed,'net_profit',net,
  'gross_margin',case when rev>0 then gross/rev end,'net_margin',case when rev>0 then net/rev end,
  'missing',missing,'complete',jsonb_array_length(missing)=0 and fixed is not null,
  'plan',to_jsonb(p),'planned_revenue',pm->'revenue','weekly_fixed',pm->'fixed','fixed_ratio',pm->'fixed_ratio',
  'forecast_revisions',recipe_state,'components',components);
end $$;
create function quote_costed_order(p_order jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin');q jsonb;e jsonb;
begin q:=quote_order(p_order);e:=costing_order_math(q);
 return q||jsonb_build_object('costing',e,'cost_token',encode(sha256(convert_to(e::text,'UTF8')),'hex'));
end $$;
create function create_costed_order(p_order jsonb) returns orders language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin');o orders;q jsonb;e jsonb; existed boolean;rid uuid:=nullif(p_order->>'client_request_id','')::uuid;
begin
 if rid is null then raise exception 'A save request ID is required';end if;
 if nullif(p_order->>'quote_token','') is null or nullif(p_order->>'cost_token','') is null then raise exception 'Review the order total and profit before saving';end if;
 perform m8_lock_current_day();
 perform pg_advisory_xact_lock(hashtextextended('sfx-costing',0));
 perform pg_advisory_xact_lock(hashtext('order-request-'||uid::text||rid::text));
 select exists(select 1 from orders where created_by=uid and client_request_id=rid) into existed;
 -- Original RPC retains role, closed-day, price-token, request-hash, numbering and payment/ledger guards.
 o:=create_order(p_order-'cost_token');
 if existed then return o;end if;
 select jsonb_build_object('total',o.total,'items',coalesce(jsonb_agg(to_jsonb(i)),'[]')) into q from order_items i where i.order_id=o.id;
 e:=costing_order_math(q);
 if p_order->>'cost_token' is distinct from encode(sha256(convert_to(e::text,'UTF8')),'hex') then
  raise exception 'Costing changed; review the updated profit before saving';end if;
 insert into order_cost_snapshots(order_id,estimate,created_by)values(o.id,e,uid);
 return o;
end $$;
create function get_order_cost(p_order uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('operations','admin');result jsonb;
begin
 select s.estimate||jsonb_build_object('cancelled',o.status='cancelled','saved_at',s.created_at) into result
 from order_cost_snapshots s join orders o on o.id=s.order_id where s.order_id=p_order;
 return result;
end $$;


-- Workbook inputs as supplied on 14 Oct 2026; six text amounts normalized with user approval.
-- Only Admin may load these. Existing recipes and live menu prices are never overwritten.
create function load_costing_workbook() returns int language plpgsql security definer set search_path=public,pg_catalog as $$
declare uid uuid:=require_role('admin');x jsonb;vid uuid;n int:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('sfx-costing',0));
 for x in select * from jsonb_array_elements($workbook$[{"name":"Fried Rice","menu_name":"Fried Rice","inputs":{"ingredients":[{"name":"Rice (1Kg)","cost":120.0},{"name":"Red long pepper","cost":100.0},{"name":"Green bell pepper","cost":60.0},{"name":"Liver","cost":50.0},{"name":"Green beans and carrots","cost":80.0},{"name":"Onions","cost":10.0},{"name":"Oil","cost":50.0},{"name":"Turmeric","cost":10.0},{"name":"Curry","cost":20.0},{"name":"Tuzzot","cost":15.0},{"name":"Thyme","cost":10.0},{"name":"Maggie","cost":20.0},{"name":"Black Pepper","cost":10.0},{"name":"Chicken","cost":60.0}],"packaging":100.0,"overhead":100.0,"yield":5.0,"multiplier":2.0,"rounding":10,"planned_batches":5}},{"name":"Village Rice","menu_name":"Native Rice + Chicken","inputs":{"ingredients":[{"name":"Rice (1Kg)","cost":120.0},{"name":"Red long bell pepper","cost":200.0},{"name":"Hot pepper","cost":30.0},{"name":"Palm oil","cost":100.0},{"name":"Onions","cost":10.0},{"name":"Spinach","cost":70.0},{"name":"Tuzzot","cost":15.0},{"name":"Crayfish","cost":70.0},{"name":"Maggie","cost":6.0},{"name":"Chicken","cost":60.0},{"name":"Shaki and ponmo","cost":200.0}],"packaging":100.0,"overhead":0.0,"yield":6.0,"multiplier":2.14,"rounding":10,"planned_batches":0}},{"name":"Jollof Rice","menu_name":"Jollof Rice + Chicken","inputs":{"ingredients":[{"name":"Rice (1Kg)","cost":120.0},{"name":"Red long bell pepper","cost":200.0},{"name":"Hot pepper","cost":30.0},{"name":"Green bell pepper","cost":10.0},{"name":"Onions","cost":10.0},{"name":"Oil","cost":60.0},{"name":"Tomato paste","cost":40.0},{"name":"Curry","cost":50.0},{"name":"Tuzzot","cost":15.0},{"name":"Thyme","cost":10.0},{"name":"Maggie","cost":26.0},{"name":"Black Pepper","cost":10.0},{"name":"Chicken","cost":60.0}],"packaging":100.0,"overhead":0.0,"yield":5.0,"multiplier":2.0,"rounding":10,"planned_batches":5}},{"name":"Vegetable Soup","menu_name":"Vegetable Soup","inputs":{"ingredients":[{"name":"Red long bell pepper","cost":100.0},{"name":"Hot pepper","cost":30.0},{"name":"Onions","cost":10.0},{"name":"Palm oil","cost":60.0},{"name":"Spinach","cost":70.0},{"name":"Tuzzot","cost":15.0},{"name":"Maggie","cost":8.0},{"name":"Shaki and ponmo","cost":150.0},{"name":"Crayfish","cost":35.0},{"name":"Chicken","cost":60.0}],"packaging":100.0,"overhead":0.0,"yield":4.0,"multiplier":2.15,"rounding":10,"planned_batches":5}},{"name":"Egusi Soup","menu_name":"Egusi Soup","inputs":{"ingredients":[{"name":"Red long bell pepper","cost":100.0},{"name":"Hot pepper","cost":60.0},{"name":"Onions","cost":10.0},{"name":"Palm oil","cost":100.0},{"name":"Spinach","cost":70.0},{"name":"Tuzzot","cost":15.0},{"name":"Maggie","cost":8.0},{"name":"Shaki and ponmo","cost":200.0},{"name":"Crayfish","cost":70.0},{"name":"Chicken","cost":60.0}],"packaging":100.0,"overhead":100.0,"yield":4.0,"multiplier":2.0,"rounding":10,"planned_batches":0}},{"name":"Classic Shawarma","menu_name":"Classic Shawarma","inputs":{"ingredients":[{"name":"Chicken and sausages","cost":300.0},{"name":"Sweet pepper","cost":10.0},{"name":"Hot pepper","cost":7.0},{"name":"Black pepper","cost":10.0},{"name":"Garlic powder","cost":10.0},{"name":"Salt","cost":10.0},{"name":"Mayonnaise","cost":80.0},{"name":"Ketchup","cost":50.0},{"name":"Condensed milk","cost":65.0},{"name":"Lemon sauce","cost":10.0},{"name":"Milk, cabbage and carrots","cost":74.0},{"name":"Shawarma bread","cost":72.0},{"name":"Oil","cost":10.0}],"packaging":120.0,"overhead":65.0,"yield":4.0,"multiplier":2.0,"rounding":10,"planned_batches":20}},{"name":"Zinger Burger","menu_name":"Zinger Burger","inputs":{"ingredients":[{"name":"Chicken","cost":250.0},{"name":"Sweet pepper","cost":10.0},{"name":"Curry","cost":10.0},{"name":"Black pepper","cost":5.0},{"name":"Garlic powder","cost":7.0},{"name":"Chicken seasoning cube","cost":15.0},{"name":"Meatball spice","cost":3.0},{"name":"Salt","cost":10.0},{"name":"Milk","cost":14.0},{"name":"Flour","cost":30.0},{"name":"Mayonnaise","cost":50.0},{"name":"Ketchup","cost":30.0},{"name":"Burger bread","cost":80.0},{"name":"Oil","cost":15.0}],"packaging":120.0,"overhead":80.0,"yield":4.0,"multiplier":2.0,"rounding":10,"planned_batches":20}},{"name":"BBQ Burger","menu_name":"BBQ Burger","inputs":{"ingredients":[{"name":"Minced chicken","cost":200.0},{"name":"Sweet pepper","cost":10.0},{"name":"Curry","cost":15.0},{"name":"Black pepper","cost":10.0},{"name":"Meatball spice","cost":7.0},{"name":"Onion","cost":5.0},{"name":"Long red pepper","cost":10.0},{"name":"Green pepper","cost":7.0},{"name":"Garlic powder","cost":4.0},{"name":"Nutmeg","cost":3.0},{"name":"Chicken seasoning cube","cost":20.0},{"name":"Salt","cost":15.0},{"name":"Mayonnaise","cost":50.0},{"name":"Condensed milk","cost":65.0},{"name":"Milk","cost":14.0},{"name":"BBQ sauce","cost":30.0},{"name":"Burger bread","cost":80.0},{"name":"Oil","cost":20.0},{"name":"Ketchup","cost":30.0}],"packaging":120.0,"overhead":80.0,"yield":4.0,"multiplier":2.0,"rounding":10,"planned_batches":20}},{"name":"Classic Burger","menu_name":"Classic Burger","inputs":{"ingredients":[{"name":"Minced chicken","cost":220.0},{"name":"Sweet pepper","cost":10.0},{"name":"Curry","cost":15.0},{"name":"Black pepper","cost":10.0},{"name":"Meatball spice","cost":7.0},{"name":"Onion","cost":5.0},{"name":"Long red pepper","cost":10.0},{"name":"Green pepper","cost":7.0},{"name":"Garlic powder","cost":4.0},{"name":"Nutmeg","cost":3.0},{"name":"Chicken seasoning cube","cost":20.0},{"name":"Salt","cost":15.0},{"name":"Mayonnaise","cost":50.0},{"name":"Condensed milk","cost":30.0},{"name":"Milk","cost":55.0},{"name":"Egg","cost":28.0},{"name":"Burger bread","cost":80.0},{"name":"Oil","cost":20.0},{"name":"Unlabelled line — needs identifying","cost":0.0}],"packaging":120.0,"overhead":80.0,"yield":4.0,"multiplier":2.0,"rounding":10,"planned_batches":20}},{"name":"Suya Shawarma","menu_name":"Suya Shawarma","inputs":{"ingredients":[{"name":"Chicken and Sausages","cost":300.0},{"name":"Sweet pepper","cost":7.0},{"name":"Curry","cost":5.0},{"name":"Suya pepper","cost":20.0},{"name":"Black pepper","cost":5.0},{"name":"Garlic powder","cost":5.0},{"name":"Chicken seasoning cube","cost":16.0},{"name":"Thyme","cost":3.0},{"name":"Salt","cost":10.0},{"name":"Onion, cabbage and carrot","cost":65.0},{"name":"Mayonnaise","cost":80.0},{"name":"Ketchup","cost":50.0},{"name":"Milk","cost":14.0},{"name":"Oil","cost":10.0},{"name":"Shawarma bread","cost":72.0}],"packaging":120.0,"overhead":0.0,"yield":4.0,"multiplier":2.0,"rounding":10,"planned_batches":20}}]$workbook$::jsonb) loop
  select v.id into vid from product_variants v join products p on p.id=v.product_id
   where p.name=x->>'menu_name' and v.name='Regular' and p.addon_id is null;
  if not exists(select 1 from cost_recipes where name=x->>'name' or (vid is not null and variant_id=vid)) then
   perform save_cost_recipe(jsonb_build_object('name',x->>'name','variant_id',vid,'inputs',x->'inputs'));n:=n+1;
  end if;
 end loop;
 return n;
end $$;
revoke all on function load_costing_workbook() from public,anon;
grant execute on function load_costing_workbook() to authenticated;

-- All internals remain unavailable to browser callers. Only guarded public RPCs are callable.
revoke all on function costing_immutable(),costing_number(jsonb,text,numeric,numeric,int),costing_lines(jsonb),costing_recipe_math(jsonb),costing_plan_math(jsonb),costing_order_math(jsonb) from public,anon,authenticated;
revoke all on function preview_cost_recipe(jsonb),preview_cost_plan(jsonb),save_cost_recipe(jsonb),save_cost_plan(jsonb,int),apply_cost_price(uuid,int,numeric),get_costing(date,date),quote_costed_order(jsonb),create_costed_order(jsonb),get_order_cost(uuid) from public,anon;
grant execute on function preview_cost_recipe(jsonb),preview_cost_plan(jsonb),save_cost_recipe(jsonb),save_cost_plan(jsonb,int),apply_cost_price(uuid,int,numeric),get_costing(date,date),quote_costed_order(jsonb),create_costed_order(jsonb),get_order_cost(uuid) to authenticated;
commit;
