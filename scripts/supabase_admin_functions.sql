-- ==============================================================================
-- JAI DUBBER - Supabase Admin RPC Functions
-- Run this script in the Supabase SQL Editor to enable:
-- 1. admin_list_licenses   (បញ្ជី License ថ្មីៗ)
-- 2. admin_check_license  (ពិនិត្យស្ថានភាព License តាម Key ឬ Machine ID)
-- 3. admin_revoke_license (ផ្អាក / បិទដំណើរការ License តាម Key ឬ Machine ID)
-- 4. admin_restore_license(បើកដំណើរការ License ឡើងវិញ)
-- ==============================================================================

-- 1. Function សម្រាប់ទាញបញ្ជី License ថ្មីៗ
create or replace function admin_list_licenses(
  p_admin_secret text,
  p_limit int default 10
)
returns json
language plpgsql
security definer
as $$
declare
  v_result json;
begin
  if p_admin_secret <> 'JAI_ADMIN_SECRET_2026' then
    return json_build_object('success', false, 'message', 'Admin Secret មិនត្រឹមត្រូវ!');
  end if;

  select json_agg(t) into v_result
  from (
    select 
      id,
      license_key,
      customer_name,
      customer_contact,
      machine_id,
      plan_type,
      is_active,
      activated_at,
      expires_at,
      created_at
    from licenses
    order by created_at desc
    limit coalesce(p_limit, 10)
  ) t;

  return json_build_object(
    'success', true,
    'data', coalesce(v_result, '[]'::json)
  );
end;
$$;

-- 2. Function សម្រាប់ពិនិត្យ License (តាម Key ឬ Machine ID)
create or replace function admin_check_license(
  p_admin_secret text,
  p_query text
)
returns json
language plpgsql
security definer
as $$
declare
  v_lic record;
  v_clean text;
begin
  if p_admin_secret <> 'JAI_ADMIN_SECRET_2026' then
    return json_build_object('success', false, 'message', 'Admin Secret មិនត្រឹមត្រូវ!');
  end if;

  v_clean := trim(p_query);
  if v_clean is null or v_clean = '' then
    return json_build_object('success', false, 'message', 'សូមបញ្ចូល License Key ឬ Machine ID!');
  end if;

  select * into v_lic
  from licenses
  where license_key ilike v_clean or machine_id ilike v_clean
  order by created_at desc
  limit 1;

  if not found then
    return json_build_object('success', false, 'message', 'រកមិនឃើញ License នេះក្នុងប្រព័ន្ធទេ!');
  end if;

  return json_build_object(
    'success', true,
    'data', json_build_object(
      'id', v_lic.id,
      'license_key', v_lic.license_key,
      'customer_name', v_lic.customer_name,
      'customer_contact', v_lic.customer_contact,
      'machine_id', v_lic.machine_id,
      'plan_type', v_lic.plan_type,
      'is_active', v_lic.is_active,
      'activated_at', v_lic.activated_at,
      'expires_at', v_lic.expires_at,
      'created_at', v_lic.created_at,
      'is_expired', (v_lic.expires_at is not null and v_lic.expires_at < now())
    )
  );
end;
$$;

-- 3. Function សម្រាប់ផ្អាក/បិទដំណើរការ License (Revoke)
create or replace function admin_revoke_license(
  p_admin_secret text,
  p_query text
)
returns json
language plpgsql
security definer
as $$
declare
  v_clean text;
  v_lic record;
  v_count int;
begin
  if p_admin_secret <> 'JAI_ADMIN_SECRET_2026' then
    return json_build_object('success', false, 'message', 'Admin Secret មិនត្រឹមត្រូវ!');
  end if;

  v_clean := trim(p_query);
  if v_clean is null or v_clean = '' then
    return json_build_object('success', false, 'message', 'សូមបញ្ចូល License Key ឬ Machine ID ដែលចង់ផ្អាក!');
  end if;

  select * into v_lic
  from licenses
  where license_key ilike v_clean or machine_id ilike v_clean
  order by created_at desc
  limit 1;

  if not found then
    return json_build_object('success', false, 'message', 'រកមិនឃើញ License ដែលត្រូវផ្អាកទេ!');
  end if;

  -- បិទដំណើរការ License ទាំងអស់ដែលត្រូវគ្នានឹង License Key ឬ Machine ID នេះ
  update licenses
  set is_active = false
  where license_key ilike v_clean or machine_id ilike v_clean or id = v_lic.id;

  get diagnostics v_count = row_count;

  return json_build_object(
    'success', true,
    'message', 'បានផ្អាក (Revoke) License ក្នុងប្រព័ន្ធជោគជ័យ!',
    'license_key', v_lic.license_key,
    'machine_id', v_lic.machine_id,
    'customer_name', v_lic.customer_name,
    'count', v_count
  );
end;
$$;

-- 4. Function សម្រាប់បើកដំណើរការ License ឡើងវិញ (Restore / Reactivate)
create or replace function admin_restore_license(
  p_admin_secret text,
  p_query text
)
returns json
language plpgsql
security definer
as $$
declare
  v_clean text;
  v_lic record;
  v_count int;
begin
  if p_admin_secret <> 'JAI_ADMIN_SECRET_2026' then
    return json_build_object('success', false, 'message', 'Admin Secret មិនត្រឹមត្រូវ!');
  end if;

  v_clean := trim(p_query);
  if v_clean is null or v_clean = '' then
    return json_build_object('success', false, 'message', 'សូមបញ្ចូល License Key ឬ Machine ID ដែលចង់បើកដំណើរការឡើងវិញ!');
  end if;

  select * into v_lic
  from licenses
  where license_key ilike v_clean or machine_id ilike v_clean
  order by created_at desc
  limit 1;

  if not found then
    return json_build_object('success', false, 'message', 'រកមិនឃើញ License នេះក្នុងប្រព័ន្ធទេ!');
  end if;

  update licenses
  set is_active = true
  where license_key ilike v_clean or machine_id ilike v_clean or id = v_lic.id;

  get diagnostics v_count = row_count;

  return json_build_object(
    'success', true,
    'message', 'បានបើកដំណើរការ (Restore) License ឡើងវិញជោគជ័យ!',
    'license_key', v_lic.license_key,
    'machine_id', v_lic.machine_id,
    'customer_name', v_lic.customer_name,
    'count', v_count
  );
end;
$$;

-- 5. Function សម្រាប់បង្កើត License Key ថ្មី (Generate License) គាំទ្រគ្រប់ Plan និងអក្សរខ្មែរ
create or replace function admin_generate_license(
  p_admin_secret text,
  p_machine_id text,
  p_plan_type text default '1month',
  p_customer_name text default 'VIP Customer'
)
returns json
language plpgsql
security definer
as $$
declare
  v_clean_mid text;
  v_raw_plan text;
  v_canonical_plan text;
  v_expires_at timestamptz;
  v_new_key text;
begin
  if p_admin_secret <> 'JAI_ADMIN_SECRET_2026' then
    return json_build_object('success', false, 'message', 'Admin Secret មិនត្រឹមត្រូវ!');
  end if;

  v_clean_mid := trim(p_machine_id);
  if v_clean_mid is null or v_clean_mid = '' then
    return json_build_object('success', false, 'message', 'សូមបញ្ចូល Machine ID!');
  end if;

  v_raw_plan := lower(trim(coalesce(p_plan_type, '1month')));
  v_raw_plan := regexp_replace(v_raw_plan, '[\s\-_]+', '', 'g');

  -- Robust plan matching supporting English & Khmer aliases
  if v_raw_plan in ('lifetime', 'life', 'forever', 'perm', 'permanent', 'ទិញដាច់', 'ដាច់', 'ពេញមួយជីវិត') then
    v_canonical_plan := 'lifetime';
    v_expires_at := null;
  elsif v_raw_plan in ('1year', '1years', '1y', 'yearly', 'year', '12m', '12month', '12months', '1ឆ្នាំ', '១ឆ្នាំ', '12ខែ', '១២ខែ') 
        or v_raw_plan ~ '^(1|១)(y|year|ឆ្នាំ)' then
    v_canonical_plan := '1year';
    v_expires_at := now() + interval '365 days';
  elsif v_raw_plan in ('6month', '6months', '6m', '6', '៦', '6ខែ', '៦ខែ', 'halfyear', 'half-year') 
        or v_raw_plan ~ '^(6|៦)(m|month|ខែ)' then
    v_canonical_plan := '6month';
    v_expires_at := now() + interval '180 days';
  elsif v_raw_plan in ('3month', '3months', '3m', '3', '៣', '3ខែ', '៣ខែ', 'quarter') 
        or v_raw_plan ~ '^(3|៣)(m|month|ខែ)' then
    v_canonical_plan := '3month';
    v_expires_at := now() + interval '90 days';
  elsif v_raw_plan in ('1week', '1weeks', '1w', 'weekly', 'week', '7d', '7days', '1សប្តាហ៍', '១សប្តាហ៍', '7ថ្ងៃ', '៧ថ្ងៃ') 
        or v_raw_plan ~ '^(1|១)(w|week|សប្តាហ៍)' then
    v_canonical_plan := '1week';
    v_expires_at := now() + interval '7 days';
  elsif v_raw_plan in ('1day', '1days', '1d', 'day', 'daily', 'trial', '1ថ្ងៃ', '១ថ្ងៃ', 'សាកល្បង') 
        or v_raw_plan ~ '^(1|១)(d|day|ថ្ងៃ)' then
    v_canonical_plan := '1day';
    v_expires_at := now() + interval '1 day';
  else
    v_canonical_plan := '1month';
    v_expires_at := now() + interval '30 days';
  end if;

  -- Generate unique key: JAIDUB-XXXX-XXXX-XXXX
  select upper(
    'JAIDUB-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 5, 4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 9, 4)
  ) into v_new_key;

  insert into licenses (
    license_key,
    machine_id,
    customer_name,
    plan_type,
    is_active,
    expires_at,
    created_at,
    activated_at
  ) values (
    v_new_key,
    v_clean_mid,
    coalesce(nullif(trim(p_customer_name), ''), 'VIP Customer'),
    v_canonical_plan,
    true,
    v_expires_at,
    now(),
    now()
  );

  return json_build_object(
    'success', true,
    'license_key', v_new_key,
    'machine_id', v_clean_mid,
    'customer_name', coalesce(nullif(trim(p_customer_name), ''), 'VIP Customer'),
    'plan_type', v_canonical_plan,
    'expires_at', v_expires_at
  );
end;
$$;

-- 6. បិទសិទ្ធិមើល ឬកែប្រែតារាងផ្ទាល់ពីខាងក្រៅ (Row-Level Security & Table Lockdown)
alter table licenses enable row level security;
revoke all on table licenses from anon, authenticated;

-- 7. ផ្តល់សិទ្ធិ Execute តែលើ RPC Functions ដែលមានការការពារប៉ុណ្ណោះ
grant execute on function admin_list_licenses(text, int) to anon, authenticated;
grant execute on function admin_check_license(text, text) to anon, authenticated;
grant execute on function admin_revoke_license(text, text) to anon, authenticated;
grant execute on function admin_restore_license(text, text) to anon, authenticated;
grant execute on function admin_generate_license(text, text, text, text) to anon, authenticated;
