-- M1: server-enforced 12-hour app sessions and staff/login audit.
-- Additive security controls. schema.sql and its role checks remain protected.
begin;

create or replace function m1_session_active() returns boolean
language sql stable security definer set search_path = public, pg_catalog as $$
  select exists (
    select 1 from auth.sessions s join public.profiles p on p.id = s.user_id
    where s.id = (auth.jwt()->>'session_id')::uuid
      and s.user_id = auth.uid() and p.is_active
      and s.created_at <= statement_timestamp()
      and s.created_at > statement_timestamp() - interval '12 hours'
  );
$$;
revoke all on function m1_session_active() from public, anon;
grant execute on function m1_session_active() to authenticated;

-- Every existing RLS policy and every existing RPC still calls app_role.
create or replace function app_role() returns user_role
language sql stable security definer set search_path = public, pg_catalog as $$
  select role from profiles where id = auth.uid() and is_active and m1_session_active();
$$;

-- Preserve the role check; add an earlier, explicit session check.
create or replace function require_role(variadic allowed user_role[]) returns uuid
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare r user_role;
begin
  if not m1_session_active() then
    raise exception 'Session expired or staff account inactive; sign in again' using errcode = '42501';
  end if;
  r := app_role();
  if r is null or not (r = any(allowed)) then
    raise exception 'Not allowed for your role' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- Restrictive policies are ANDed with existing permissions, including own-row
-- Logistics reads. They grant no new access and no new write/delete path.
do $$
declare t text;
begin
  foreach t in array array['profiles','settings','accounts','fx_rates','product_categories',
    'products','product_variants','addons','product_addons','price_history','orders',
    'order_items','expense_categories','withdrawals','purchases','purchase_items',
    'account_transfers','ledger_entries','day_closes','activity_log','debts','debt_settlements']
  loop
    execute format('create policy m1_active_session on public.%I as restrictive for all to authenticated
      using ((select public.m1_session_active())) with check ((select public.m1_session_active()))', t);
  end loop;
  -- storage.sql is already installed in the hosted project; plain Postgres tests
  -- have no Storage tables. Existing bucket/folder policies continue to apply.
  if to_regclass('storage.objects') is not null then
    execute 'create policy m1_receipt_session on storage.objects as restrictive for all to authenticated
      using (bucket_id <> ''receipts'' or (select public.m1_session_active()))
      with check (bucket_id <> ''receipts'' or (select public.m1_session_active()))';
  end if;
end $$;

create or replace function get_session_profile()
returns table (id uuid, full_name text, phone text, role user_role, expires_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare uid uuid := require_role('operations','logistics','admin');
begin
  return query select p.id, p.full_name, p.phone, p.role, s.created_at + interval '12 hours'
    from profiles p join auth.sessions s on s.user_id = p.id
    where p.id = uid and s.id = (auth.jwt()->>'session_id')::uuid;
end $$;
revoke all on function get_session_profile() from public, anon;
grant execute on function get_session_profile() to authenticated;

create unique index m1_one_login_per_session on activity_log (entity_id)
  where action = 'auth.login' and entity = 'auth.sessions';

create or replace function record_login()
returns table (id uuid, full_name text, phone text, role user_role, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare uid uuid := require_role('operations','logistics','admin');
begin
  insert into activity_log(actor_id, action, entity, entity_id)
  values (uid, 'auth.login', 'auth.sessions', auth.jwt()->>'session_id')
  on conflict (entity_id) where action = 'auth.login' and entity = 'auth.sessions' do nothing;
  return query select * from get_session_profile();
end $$;
revoke all on function record_login() from public, anon;
grant execute on function record_login() to authenticated;

create or replace function trg_m1_staff_audit() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if tg_op = 'INSERT' or new is distinct from old then
    perform log_activity(case when tg_op = 'INSERT' then 'staff.create' else 'staff.update' end,
      'profiles', new.id::text,
      case when tg_op = 'INSERT' then jsonb_build_object('after', to_jsonb(new))
      else jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)) end);
  end if;
  return new;
end $$;
revoke all on function trg_m1_staff_audit() from public, anon, authenticated;
create trigger m1_staff_audit after insert or update on profiles
  for each row execute function trg_m1_staff_audit();
create trigger m1_staff_no_delete before delete on profiles
  for each row execute function trg_no_delete();

-- Called only by the Edge Function after Auth confirms the PIN reset.
-- Both the actor and their server-side session are checked again here.
create or replace function audit_staff_pin_reset(p_actor uuid, p_session uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not exists (select 1 from profiles p join auth.sessions s on s.user_id = p.id
    where p.id = p_actor and p.role = 'admin' and p.is_active and s.id = p_session
      and s.created_at <= statement_timestamp()
      and s.created_at > statement_timestamp() - interval '12 hours') then
    raise exception 'Not allowed for your role' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = p_target) then
    raise exception 'Staff member not found';
  end if;
  insert into activity_log(actor_id, action, entity, entity_id)
  values (p_actor, 'staff.pin_reset', 'profiles', p_target::text);
end $$;
revoke all on function audit_staff_pin_reset(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function audit_staff_pin_reset(uuid,uuid,uuid) to service_role;

commit;
