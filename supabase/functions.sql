-- =========================================================
-- Closet de Erimar · Sistema de fidelización con QR
-- functions.sql — Funciones RPC (toda la lógica de negocio)
-- =========================================================
-- Ejecuta este archivo DESPUÉS de schema.sql
-- =========================================================

-- ---------------------------------------------------------
-- Utilidad: hash SHA-256 en hexadecimal
-- ---------------------------------------------------------
create or replace function hash_token(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(p_token, 'sha256'), 'hex');
$$;

-- ---------------------------------------------------------
-- reveal_coupon(p_token)
-- Función pública (llamada por el frontend con la anon key).
-- Es la ÚNICA puerta de entrada para obtener un cupón.
--
-- Garantías:
--  * El descuento y el código los decide siempre el backend.
--  * Si la tarjeta ya tiene cupón, devuelve siempre el mismo.
--  * Si no lo tiene, lo crea de forma atómica descontando
--    inventario real (con bloqueo de fila -> sin condiciones
--    de carrera entre aperturas simultáneas).
--  * Nunca revela el token, el hash, ni ids internos.
-- ---------------------------------------------------------
create or replace function reveal_coupon(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_card record;
  v_campaign record;
  v_coupon record;
  v_customer_name text;
  v_random numeric;
  v_cumulative integer;
  v_tier record;
  v_chosen_percent integer;
  v_code text;
  v_attempts integer := 0;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_card');
  end if;

  v_hash := hash_token(p_token);

  -- Bloquea la fila de la tarjeta para serializar aperturas
  -- concurrentes del MISMO qr (evita doble asignación).
  select * into v_card
  from qr_cards
  where token_hash = v_hash and active = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_card');
  end if;

  select full_name into v_customer_name from customers where id = v_card.customer_id;

  -- ¿Ya existe un cupón para esta tarjeta? (qr_card_id es UNIQUE
  -- en la tabla coupons, así que como máximo hay una fila).
  select * into v_coupon from coupons where qr_card_id = v_card.id;

  if found then
    -- Expiración perezosa: si venció, actualiza el estado.
    if v_coupon.status = 'available' and v_coupon.expires_at < now() then
      update coupons set status = 'expired' where id = v_coupon.id
      returning * into v_coupon;
    end if;

    return jsonb_build_object(
      'ok', true,
      'is_new', false,
      'customer_name', v_customer_name,
      'code', v_coupon.code,
      'discount_percent', v_coupon.discount_percent,
      'status', v_coupon.status,
      'issued_at', v_coupon.issued_at,
      'expires_at', v_coupon.expires_at
    );
  end if;

  -- No existe cupón todavía: hay que crearlo.
  -- Bloquea la fila de campaña para serializar el conteo global.
  select * into v_campaign from campaigns where id = v_card.campaign_id for update;

  if not found or v_campaign.active = false then
    return jsonb_build_object('ok', false, 'error', 'campaign_inactive');
  end if;

  if (select count(*) from coupons where campaign_id = v_campaign.id) >= v_campaign.max_coupons then
    return jsonb_build_object('ok', false, 'error', 'campaign_exhausted');
  end if;

  -- Bloquea TODAS las filas de inventario de esta campaña para
  -- que dos aperturas simultáneas nunca lean el mismo remanente.
  perform 1 from campaign_discount_inventory
  where campaign_id = v_campaign.id
  for update;

  select coalesce(sum(remaining), 0) into v_cumulative
  from campaign_discount_inventory
  where campaign_id = v_campaign.id;

  if v_cumulative <= 0 then
    return jsonb_build_object('ok', false, 'error', 'campaign_exhausted');
  end if;

  -- Selección aleatoria ponderada por el remanente real de cada
  -- porcentaje (no por probabilidad independiente): se sortea un
  -- número entre 0 y el total restante, y se recorre el
  -- inventario acumulando hasta encontrar el tramo elegido.
  v_random := floor(random() * v_cumulative);
  v_cumulative := 0;
  v_chosen_percent := null;

  for v_tier in
    select discount_percent, remaining
    from campaign_discount_inventory
    where campaign_id = v_campaign.id and remaining > 0
    order by discount_percent asc
  loop
    v_cumulative := v_cumulative + v_tier.remaining;
    if v_random < v_cumulative then
      v_chosen_percent := v_tier.discount_percent;
      exit;
    end if;
  end loop;

  if v_chosen_percent is null then
    return jsonb_build_object('ok', false, 'error', 'campaign_exhausted');
  end if;

  update campaign_discount_inventory
  set remaining = remaining - 1
  where campaign_id = v_campaign.id and discount_percent = v_chosen_percent;

  -- Genera un código único (reintenta si por azar choca).
  loop
    v_code := 'ERIMAR-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 5));
    v_attempts := v_attempts + 1;
    exit when not exists (select 1 from coupons where code = v_code);
    if v_attempts >= 10 then
      raise exception 'could_not_generate_unique_coupon_code';
    end if;
  end loop;

  insert into coupons (
    customer_id, campaign_id, qr_card_id, code, discount_percent,
    status, issued_at, expires_at
  ) values (
    v_card.customer_id, v_campaign.id, v_card.id, v_code, v_chosen_percent,
    'available', now(), now() + make_interval(days => v_campaign.duration_days)
  )
  returning * into v_coupon;

  return jsonb_build_object(
    'ok', true,
    'is_new', true,
    'customer_name', v_customer_name,
    'code', v_coupon.code,
    'discount_percent', v_coupon.discount_percent,
    'status', v_coupon.status,
    'issued_at', v_coupon.issued_at,
    'expires_at', v_coupon.expires_at
  );
end;
$$;

-- Permite que el rol público (anon, usado por el frontend
-- estático) invoque esta función. No se otorga ningún permiso
-- directo sobre las tablas: solo sobre esta función controlada.
revoke all on function reveal_coupon(text) from public;
grant execute on function reveal_coupon(text) to anon, authenticated;

-- ---------------------------------------------------------
-- get_terms()
-- Devuelve el texto de términos y condiciones (público).
-- ---------------------------------------------------------
create or replace function get_terms()
returns text
language sql
security definer
set search_path = public
as $$
  select content from site_content where key = 'terms';
$$;

revoke all on function get_terms() from public;
grant execute on function get_terms() to anon, authenticated;

-- =========================================================
-- FUNCIONES ADMINISTRATIVAS
-- Todas comprueban is_admin() internamente. Aunque la RLS ya
-- protege las tablas, se revalida aquí para que estas RPC
-- nunca dependan únicamente de las políticas.
-- =========================================================

-- ---------------------------------------------------------
-- create_qr_card(customer_id, campaign_id)
-- Genera un token aleatorio (32 bytes), guarda solo su hash,
-- y devuelve el token EN TEXTO PLANO una única vez para que
-- el admin construya la URL del QR. No se guarda en ningún
-- sitio en texto plano.
-- ---------------------------------------------------------
create or replace function create_qr_card(p_customer_id uuid, p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_hash text;
  v_card_id uuid;
  v_campaign_active boolean;
begin
  if not is_admin() then
    raise exception 'not_authorized';
  end if;

  if not exists (select 1 from customers where id = p_customer_id) then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;

  select active into v_campaign_active from campaigns where id = p_campaign_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  end if;
  if not v_campaign_active then
    return jsonb_build_object('ok', false, 'error', 'campaign_inactive');
  end if;

  v_token := encode(gen_random_bytes(24), 'base64');
  v_token := replace(replace(replace(v_token, '/', '_'), '+', '-'), '=', '');
  v_hash := hash_token(v_token);

  insert into qr_cards (customer_id, campaign_id, token_hash, active)
  values (p_customer_id, p_campaign_id, v_hash, true)
  returning id into v_card_id;

  return jsonb_build_object('ok', true, 'qr_card_id', v_card_id, 'token', v_token);
end;
$$;

revoke all on function create_qr_card(uuid, uuid) from public;
grant execute on function create_qr_card(uuid, uuid) to authenticated;

-- ---------------------------------------------------------
-- validate_coupon(p_code)
-- Consulta administrativa de un cupón por su código.
-- ---------------------------------------------------------
create or replace function validate_coupon(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon record;
  v_customer_name text;
begin
  if not is_admin() then
    raise exception 'not_authorized';
  end if;

  select * into v_coupon from coupons where code = upper(trim(p_code));

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_coupon.status = 'available' and v_coupon.expires_at < now() then
    update coupons set status = 'expired' where id = v_coupon.id returning * into v_coupon;
  end if;

  select full_name into v_customer_name from customers where id = v_coupon.customer_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_coupon.id,
    'customer_name', v_customer_name,
    'code', v_coupon.code,
    'discount_percent', v_coupon.discount_percent,
    'status', v_coupon.status,
    'issued_at', v_coupon.issued_at,
    'expires_at', v_coupon.expires_at,
    'used_at', v_coupon.used_at
  );
end;
$$;

revoke all on function validate_coupon(text) from public;
grant execute on function validate_coupon(text) to authenticated;

-- ---------------------------------------------------------
-- mark_coupon_used(p_coupon_id)
-- ---------------------------------------------------------
create or replace function mark_coupon_used(p_coupon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon record;
begin
  if not is_admin() then
    raise exception 'not_authorized';
  end if;

  select * into v_coupon from coupons where id = p_coupon_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_coupon.status = 'used' then
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  if v_coupon.status = 'expired' or v_coupon.expires_at < now() then
    update coupons set status = 'expired' where id = v_coupon.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  update coupons set status = 'used', used_at = now() where id = p_coupon_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function mark_coupon_used(uuid) from public;
grant execute on function mark_coupon_used(uuid) to authenticated;

-- ---------------------------------------------------------
-- get_campaign_stats(p_campaign_id)
-- Estadísticas + inventario para el panel administrativo.
-- ---------------------------------------------------------
create or replace function get_campaign_stats(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stats jsonb;
  v_inventory jsonb;
begin
  if not is_admin() then
    raise exception 'not_authorized';
  end if;

  -- Expira perezosamente cualquier cupón vencido antes de contar.
  update coupons set status = 'expired'
  where campaign_id = p_campaign_id and status = 'available' and expires_at < now();

  select jsonb_build_object(
    'total_slots', c.max_coupons,
    'assigned', (select count(*) from coupons where campaign_id = p_campaign_id),
    'available', (select count(*) from coupons where campaign_id = p_campaign_id and status = 'available'),
    'used', (select count(*) from coupons where campaign_id = p_campaign_id and status = 'used'),
    'expired', (select count(*) from coupons where campaign_id = p_campaign_id and status = 'expired')
  ) into v_stats
  from campaigns c where c.id = p_campaign_id;

  select jsonb_agg(jsonb_build_object(
    'discount_percent', discount_percent,
    'total', total,
    'remaining', remaining
  ) order by discount_percent)
  into v_inventory
  from campaign_discount_inventory
  where campaign_id = p_campaign_id;

  return jsonb_build_object('stats', v_stats, 'inventory', v_inventory);
end;
$$;

revoke all on function get_campaign_stats(uuid) from public;
grant execute on function get_campaign_stats(uuid) to authenticated;

-- ---------------------------------------------------------
-- create_campaign(name, max_coupons, duration_days, tiers jsonb)
-- tiers ejemplo: '[{"discount_percent":5,"total":6},
--                  {"discount_percent":10,"total":3},
--                  {"discount_percent":15,"total":1}]'
-- ---------------------------------------------------------
create or replace function create_campaign(
  p_name text,
  p_max_coupons integer,
  p_duration_days integer,
  p_tiers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_tier jsonb;
  v_sum integer := 0;
begin
  if not is_admin() then
    raise exception 'not_authorized';
  end if;

  for v_tier in select * from jsonb_array_elements(p_tiers)
  loop
    v_sum := v_sum + (v_tier->>'total')::integer;
  end loop;

  if v_sum <> p_max_coupons then
    return jsonb_build_object('ok', false, 'error', 'tiers_do_not_match_max_coupons');
  end if;

  insert into campaigns (name, active, max_coupons, duration_days)
  values (p_name, true, p_max_coupons, p_duration_days)
  returning id into v_campaign_id;

  for v_tier in select * from jsonb_array_elements(p_tiers)
  loop
    insert into campaign_discount_inventory (campaign_id, discount_percent, total, remaining)
    values (
      v_campaign_id,
      (v_tier->>'discount_percent')::integer,
      (v_tier->>'total')::integer,
      (v_tier->>'total')::integer
    );
  end loop;

  return jsonb_build_object('ok', true, 'campaign_id', v_campaign_id);
end;
$$;

revoke all on function create_campaign(text, integer, integer, jsonb) from public;
grant execute on function create_campaign(text, integer, integer, jsonb) to authenticated;

-- ---------------------------------------------------------
-- update_campaign_duration(p_campaign_id, p_duration_days)
-- Permite cambiar la vigencia (15/20/30 días) sin tocar código.
-- Afecta solo a cupones futuros, no a los ya emitidos.
-- ---------------------------------------------------------
create or replace function update_campaign_duration(p_campaign_id uuid, p_duration_days integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not_authorized';
  end if;

  update campaigns set duration_days = p_duration_days where id = p_campaign_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function update_campaign_duration(uuid, integer) from public;
grant execute on function update_campaign_duration(uuid, integer) to authenticated;

-- ---------------------------------------------------------
-- update_terms(p_content)
-- ---------------------------------------------------------
create or replace function update_terms(p_content text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not_authorized';
  end if;

  update site_content set content = p_content, updated_at = now() where key = 'terms';

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function update_terms(text) from public;
grant execute on function update_terms(text) to authenticated;
