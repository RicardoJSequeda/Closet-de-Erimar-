-- =========================================================
-- Closet de Erimar · Sistema de fidelización con QR
-- schema.sql — Estructura de base de datos (Supabase / Postgres)
-- =========================================================
-- Ejecuta este archivo completo en: Supabase Dashboard > SQL Editor
-- Luego ejecuta functions.sql
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- Tabla: campaigns
-- ---------------------------------------------------------
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  max_coupons integer not null check (max_coupons > 0),
  duration_days integer not null check (duration_days > 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Tabla: campaign_discount_inventory
-- Inventario real de cupones por porcentaje, por campaña.
-- ---------------------------------------------------------
create table if not exists campaign_discount_inventory (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  discount_percent integer not null check (discount_percent > 0 and discount_percent <= 100),
  total integer not null check (total >= 0),
  remaining integer not null check (remaining >= 0),
  primary key (campaign_id, discount_percent)
);

-- ---------------------------------------------------------
-- Tabla: customers
-- ---------------------------------------------------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Tabla: qr_cards
-- Nunca se guarda el token en texto plano, solo su hash SHA-256.
-- ---------------------------------------------------------
create table if not exists qr_cards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_qr_cards_token_hash on qr_cards (token_hash);
create index if not exists idx_qr_cards_customer on qr_cards (customer_id);

-- ---------------------------------------------------------
-- Tabla: coupons
-- qr_card_id es UNIQUE => como máximo un cupón por tarjeta,
-- lo que garantiza a nivel de base de datos que un mismo QR
-- nunca pueda generar dos cupones distintos.
-- ---------------------------------------------------------
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  qr_card_id uuid not null unique references qr_cards(id) on delete cascade,
  code text not null unique,
  discount_percent integer not null check (discount_percent > 0 and discount_percent <= 100),
  status text not null default 'available' check (status in ('available', 'used', 'expired')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists idx_coupons_code on coupons (code);
create index if not exists idx_coupons_campaign on coupons (campaign_id);
create index if not exists idx_coupons_status on coupons (status);

-- ---------------------------------------------------------
-- Tabla: admins
-- Lista blanca de usuarios (auth.users.id) que pueden operar
-- el panel /admin. Se administra manualmente desde el
-- Dashboard de Supabase (Authentication + Table editor).
-- ---------------------------------------------------------
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Textos legales editables (Términos y condiciones)
-- ---------------------------------------------------------
create table if not exists site_content (
  key text primary key,
  content text not null,
  updated_at timestamptz not null default now()
);

insert into site_content (key, content) values (
  'terms',
  E'• Cupón personal e intransferible.\n• Válido para una sola compra.\n• El cupón tiene la vigencia indicada en la página.\n• Una vez utilizado, no puede volver a utilizarse.\n• Una vez vencido, no puede utilizarse.\n• No es canjeable por dinero en efectivo.\n• El descuento corresponde al porcentaje indicado en el cupón.\n• El cupón está vinculado a la tarjeta entregada por Closet de Erimar.\n• Closet de Erimar podrá establecer condiciones adicionales para cada campaña.'
) on conflict (key) do nothing;

-- =========================================================
-- ROW LEVEL SECURITY
-- Regla general: NADA es accesible directamente desde el
-- frontend (ni con anon key ni autenticado), salvo lo que
-- las políticas de abajo permiten explícitamente.
-- Toda la lógica sensible pasa por funciones RPC
-- SECURITY DEFINER (ver functions.sql), que se ejecutan con
-- privilegios elevados y validan todo internamente.
-- =========================================================

alter table campaigns enable row level security;
alter table campaign_discount_inventory enable row level security;
alter table customers enable row level security;
alter table qr_cards enable row level security;
alter table coupons enable row level security;
alter table admins enable row level security;
alter table site_content enable row level security;

-- Nadie tiene acceso directo por defecto (no se crean políticas
-- "for select using (true)"). Los admins autenticados sí pueden
-- leer, mediante las políticas siguientes que comprueban su
-- membresía en la tabla admins.

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from admins where user_id = auth.uid()
  );
$$;

create policy admin_read_campaigns on campaigns
  for select using (is_admin());
create policy admin_write_campaigns on campaigns
  for all using (is_admin()) with check (is_admin());

create policy admin_read_inventory on campaign_discount_inventory
  for select using (is_admin());
create policy admin_write_inventory on campaign_discount_inventory
  for all using (is_admin()) with check (is_admin());

create policy admin_read_customers on customers
  for select using (is_admin());
create policy admin_write_customers on customers
  for all using (is_admin()) with check (is_admin());

create policy admin_read_qr_cards on qr_cards
  for select using (is_admin());
create policy admin_write_qr_cards on qr_cards
  for all using (is_admin()) with check (is_admin());

create policy admin_read_coupons on coupons
  for select using (is_admin());
create policy admin_write_coupons on coupons
  for all using (is_admin()) with check (is_admin());

create policy admin_read_admins on admins
  for select using (is_admin());

create policy admin_read_site_content on site_content
  for select using (is_admin());
create policy admin_write_site_content on site_content
  for all using (is_admin()) with check (is_admin());

-- La página pública NO consulta estas tablas directamente:
-- usa siempre las funciones RPC de functions.sql, que son
-- SECURITY DEFINER y devuelven únicamente los campos
-- necesarios para mostrar el cupón (nunca hashes, ids ni
-- datos de otras clientas).
