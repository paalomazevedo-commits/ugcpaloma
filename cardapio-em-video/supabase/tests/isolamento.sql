-- Teste automático de isolamento entre restaurantes.
-- Cada bloco tenta algo que NÃO pode acontecer; se acontecer, o teste para com erro.
\set ON_ERROR_STOP 1

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dono-a@teste'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'dono-b@teste'),
  ('cccccccc-0000-0000-0000-000000000003', 'atendente-a@teste');
insert into restaurants (slug, name) values ('teste-a', 'Teste A'), ('teste-b', 'Teste B');
insert into restaurant_members select id, 'aaaaaaaa-0000-0000-0000-000000000001', 'owner' from restaurants where slug = 'teste-a';
insert into restaurant_members select id, 'cccccccc-0000-0000-0000-000000000003', 'staff' from restaurants where slug = 'teste-a';
insert into restaurant_members select id, 'bbbbbbbb-0000-0000-0000-000000000002', 'owner' from restaurants where slug = 'teste-b';
insert into items (restaurant_id, name, price_cents) select id, 'Pizza A', 5000 from restaurants where slug = 'teste-a';
insert into orders (restaurant_id, number, mode, customer_name, customer_phone, payment_method, subtotal_cents, total_cents)
  select id, 1, 'retirada', 'Cliente A', '11999990000', 'pix', 1000, 1000 from restaurants where slug = 'teste-a';
insert into orders (restaurant_id, number, mode, customer_name, customer_phone, payment_method, subtotal_cents, total_cents)
  select id, 1, 'retirada', 'Cliente B', '11988880000', 'pix', 2000, 2000 from restaurants where slug = 'teste-b';

create or replace function pg_temp.expect_denied(sql text, what text) returns void language plpgsql as $$
declare n int;
begin
  begin
    execute sql;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'FALHOU: % (alterou % linha)', what, n; end if;
  exception when insufficient_privilege then null;
          when others then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.expect_denied(text, text) to anon, authenticated;

-- 1. Visitante sem login
set role anon;
set request.jwt.claim.sub = '';
do $$ begin
  begin
    if (select count(*) from orders) <> 0 then raise exception 'FALHOU: visitante leu pedidos'; end if;
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from items) = 0 then raise exception 'FALHOU: visitante não vê o cardápio'; end if;
end $$;
select pg_temp.expect_denied($q$insert into orders (restaurant_id, number, mode, customer_name, customer_phone, payment_method, subtotal_cents, total_cents) select id, 9, 'retirada', 'X', '11900000000', 'pix', 0, 0 from restaurants limit 1$q$, 'visitante não cria pedido direto');
select pg_temp.expect_denied($q$update items set price_cents = 1$q$, 'visitante não muda preço');
reset role;

-- 2. Dono do restaurante A
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  if exists (select 1 from orders where customer_name = 'Cliente B') then raise exception 'FALHOU: A leu pedido de B'; end if;
  if not exists (select 1 from orders where customer_name = 'Cliente A') then raise exception 'FALHOU: A não vê o próprio pedido'; end if;
end $$;
select pg_temp.expect_denied($q$update orders set status = 'recusado' where customer_name = 'Cliente B'$q$, 'A não muda pedido de B');
select pg_temp.expect_denied($q$update orders set total_cents = 1$q$, 'A não muda o valor do pedido');
select pg_temp.expect_denied($q$update restaurants set name = 'X' where slug = 'teste-b'$q$, 'A não muda o restaurante B');
select pg_temp.expect_denied($q$update restaurants set status = 'active' where slug = 'teste-a'$q$, 'A não muda a própria situação (suspensão)');
select pg_temp.expect_denied($q$delete from orders$q$, 'A não apaga pedidos');
select pg_temp.expect_denied($q$select next_order_number(id) from restaurants$q$, 'A não mexe no contador de pedidos');
do $$ begin
  begin
    insert into items (restaurant_id, name, price_cents) select id, 'Invasor', 100 from restaurants where slug = 'teste-b';
    raise exception 'FALHOU: A criou item em B';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 3. Atendente do restaurante A
set role authenticated;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select pg_temp.expect_denied($q$update items set price_cents = 1$q$, 'atendente não muda preço');
select pg_temp.expect_denied($q$update restaurants set is_open = false$q$, 'atendente não abre/fecha a loja');
do $$ begin
  update orders set status = 'preparo' where customer_name = 'Cliente A';
  if not found then raise exception 'FALHOU: atendente não consegue aceitar pedido'; end if;
end $$;
reset role;

\echo 'TODOS OS TESTES DE ISOLAMENTO PASSARAM'

-- 4. Vídeos e fotos (Storage)
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
declare ra uuid := (select id from restaurants where slug = 'teste-a');
        rb uuid := (select id from restaurants where slug = 'teste-b');
begin
  insert into storage.objects (bucket_id, name) values ('midia', ra || '/item/video.mp4');
  begin
    insert into storage.objects (bucket_id, name) values ('midia', rb || '/item/invasor.mp4');
    raise exception 'FALHOU: A enviou vídeo na pasta de B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('midia', 'sem-pasta.mp4');
    raise exception 'FALHOU: A enviou vídeo fora de uma pasta de restaurante';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('midia', (select id from restaurants where slug = 'teste-a') || '/item/atendente.mp4');
    raise exception 'FALHOU: atendente enviou vídeo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo 'TESTES DE MÍDIA PASSARAM'
