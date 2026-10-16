-- Cardápio em Vídeo · estrutura inicial
-- Um banco para todos os restaurantes. Cada linha leva o restaurant_id,
-- e a segurança por linha (RLS) garante que um restaurante nunca veja o outro.
-- Rode este arquivo no Supabase: SQL Editor > New query > colar > Run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  name text not null check (char_length(name) between 2 and 80),
  bio text check (char_length(bio) <= 300),
  city text check (char_length(city) <= 80),
  whatsapp text check (whatsapp ~ '^[0-9]{10,13}$'),
  logo_url text,
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents between 0 and 100000),
  accepts_delivery boolean not null default true,
  accepts_pickup boolean not null default true,
  accepts_table boolean not null default true,
  is_open boolean not null default true,
  status text not null default 'active' check (status in ('active', 'suspended')),
  order_seq integer not null default 1000,
  created_at timestamptz not null default now()
);

-- Quem administra a plataforma (você)
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Equipe de cada restaurante
create table public.restaurant_members (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index on public.restaurant_members (user_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  position integer not null default 0
);
create index on public.categories (restaurant_id);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 300),
  price_cents integer not null check (price_cents between 100 and 1000000),
  size_label text check (char_length(size_label) <= 40),
  video_url text,
  poster_url text,
  ingredients text[] not null default '{}' check (cardinality(ingredients) <= 20),
  available boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.items (restaurant_id);

create table public.item_sizes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 30),
  note text check (char_length(note) <= 40),
  price_delta_cents integer not null default 0 check (price_delta_cents between -1000000 and 1000000),
  is_default boolean not null default false,
  position integer not null default 0
);
create index on public.item_sizes (item_id);

create table public.item_extras (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  price_cents integer not null default 0 check (price_cents between 0 and 100000),
  position integer not null default 0
);
create index on public.item_extras (item_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  number integer not null,
  public_token text not null default encode(gen_random_bytes(18), 'hex'),
  status text not null default 'novo'
    check (status in ('novo', 'preparo', 'saiu', 'pronto', 'concluido', 'recusado')),
  mode text not null check (mode in ('entrega', 'retirada', 'mesa')),
  customer_name text not null check (char_length(customer_name) between 2 and 80),
  customer_phone text not null check (customer_phone ~ '^[0-9]{10,11}$'),
  address text check (char_length(address) <= 200),
  table_number text check (char_length(table_number) <= 10),
  payment_method text not null check (payment_method in ('pix', 'cartao', 'dinheiro')),
  change_for_cents integer check (change_for_cents between 0 and 1000000),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, number)
);
create index on public.orders (restaurant_id, created_at desc);
create index on public.orders (restaurant_id, customer_phone, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  item_id uuid references public.items (id) on delete set null,
  name text not null,
  size_label text,
  removed text[] not null default '{}',
  extras jsonb not null default '[]',
  notes text check (char_length(notes) <= 140),
  qty integer not null check (qty between 1 and 20),
  unit_price_cents integer not null check (unit_price_cents >= 0)
);
create index on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- Funções de apoio (rodam com privilégio do dono do banco, só leem membros)
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.is_member(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.restaurant_members where restaurant_id = rid and user_id = auth.uid()
  );
$$;

create or replace function public.is_manager(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.restaurant_members
    where restaurant_id = rid and user_id = auth.uid() and role in ('owner', 'manager')
  );
$$;

create or replace function public.restaurant_is_active(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.restaurants where id = rid and status = 'active');
$$;

-- Número do pedido sequencial por restaurante, sem corrida entre pedidos simultâneos
create or replace function public.next_order_number(rid uuid)
returns integer language sql volatile security definer set search_path = public as $$
  update public.restaurants set order_seq = order_seq + 1 where id = rid returning order_seq;
$$;
revoke all on function public.next_order_number(uuid) from public, anon, authenticated;
grant execute on function public.next_order_number(uuid) to service_role;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Segurança por linha (RLS): ligada em TODAS as tabelas
-- ---------------------------------------------------------------------------

alter table public.restaurants enable row level security;
alter table public.platform_admins enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.item_sizes enable row level security;
alter table public.item_extras enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Restaurantes: o cardápio é público enquanto o restaurante está ativo
create policy "restaurante ativo é público" on public.restaurants
  for select using (status = 'active' or public.is_member(id) or public.is_platform_admin());
create policy "gerente edita o próprio restaurante" on public.restaurants
  for update using (public.is_manager(id)) with check (public.is_manager(id));

-- Gerente não pode mudar a própria situação (ativo/suspenso) nem o contador de pedidos
revoke update on public.restaurants from authenticated;
grant update (name, bio, city, whatsapp, logo_url, delivery_fee_cents,
  accepts_delivery, accepts_pickup, accepts_table, is_open) on public.restaurants to authenticated;

create policy "admin vê a si mesmo" on public.platform_admins
  for select using (user_id = auth.uid());

create policy "membro vê a equipe do seu restaurante" on public.restaurant_members
  for select using (user_id = auth.uid() or public.is_manager(restaurant_id) or public.is_platform_admin());

-- Cardápio: leitura pública de restaurante ativo; escrita só de gerente
create policy "categoria pública" on public.categories
  for select using (public.restaurant_is_active(restaurant_id) or public.is_member(restaurant_id));
create policy "gerente cuida das categorias" on public.categories
  for all using (public.is_manager(restaurant_id)) with check (public.is_manager(restaurant_id));

create policy "item público" on public.items
  for select using (public.restaurant_is_active(restaurant_id) or public.is_member(restaurant_id));
create policy "gerente cuida dos itens" on public.items
  for all using (public.is_manager(restaurant_id)) with check (public.is_manager(restaurant_id));

create policy "tamanho público" on public.item_sizes
  for select using (public.restaurant_is_active(restaurant_id) or public.is_member(restaurant_id));
create policy "gerente cuida dos tamanhos" on public.item_sizes
  for all using (public.is_manager(restaurant_id)) with check (public.is_manager(restaurant_id));

create policy "adicional público" on public.item_extras
  for select using (public.restaurant_is_active(restaurant_id) or public.is_member(restaurant_id));
create policy "gerente cuida dos adicionais" on public.item_extras
  for all using (public.is_manager(restaurant_id)) with check (public.is_manager(restaurant_id));

-- Pedidos: só a equipe do restaurante vê. Ninguém cria pedido direto pelo navegador:
-- o pedido entra pela API do servidor, que recalcula os preços.
create policy "equipe vê os pedidos" on public.orders
  for select using (public.is_member(restaurant_id));
create policy "equipe muda a situação do pedido" on public.orders
  for update using (public.is_member(restaurant_id)) with check (public.is_member(restaurant_id));
revoke update on public.orders from authenticated;
grant update (status) on public.orders to authenticated;

create policy "equipe vê os itens dos pedidos" on public.order_items
  for select using (public.is_member(restaurant_id));

-- Visitantes sem login não escrevem em nada
revoke insert, update, delete on all tables in schema public from anon;

-- Pedidos novos aparecem no painel em tempo real (respeitando a RLS)
alter publication supabase_realtime add table public.orders;
