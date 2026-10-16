-- Dados de demonstração: um restaurante fictício para testar o sistema.
-- Rode DEPOIS do 0001_inicial.sql. Pode apagar quando cadastrar restaurantes reais.

with r as (
  insert into public.restaurants (slug, name, bio, city, whatsapp, delivery_fee_cents)
  values ('forno-nero', 'Forno Nero Pizzaria',
          'Pizzas de fermentação natural no forno a lenha e burgers artesanais.',
          'Cidade de exemplo', '11900000000', 700)
  returning id
),
c as (
  insert into public.categories (restaurant_id, name, position)
  select r.id, x.name, x.pos from r, (values ('Pizzas', 1), ('Lanches', 2), ('Doces', 3)) as x(name, pos)
  returning id, name, restaurant_id
),
i as (
  insert into public.items (restaurant_id, category_id, name, description, price_cents, size_label, ingredients, position)
  select c.restaurant_id, c.id, x.name, x.descr, x.price, x.size_label, x.ingr, x.pos
  from c join (values
    ('Pizzas', 'Calabresa', 'Calabresa fatiada fininha, cebola roxa e bastante mussarela.', 5490, 'Grande · 8 fatias', array['Molho de tomate','Mussarela','Calabresa','Cebola','Azeitona'], 1),
    ('Pizzas', 'Pepperoni', 'Pepperoni que fica crocante nas bordinhas.', 6490, 'Grande · 8 fatias', array['Molho de tomate','Mussarela','Pepperoni'], 2),
    ('Pizzas', 'Funghi', 'Cogumelos frescos, mussarela, alecrim e um fio de azeite.', 5890, 'Grande · 8 fatias', array['Mussarela','Cogumelos','Alecrim','Azeite'], 3),
    ('Lanches', 'Burger Bacon Barbecue', 'Blend de 180 g, cheddar, bacon crocante e barbecue da casa no pão brioche.', 4290, 'Simples · 180 g', array['Cheddar','Bacon','Molho barbecue','Cebola caramelizada'], 1),
    ('Lanches', 'Batata Frita da Casa', 'Batata rústica sequinha, sal de ervas e maionese verde.', 2490, 'Média · serve 2', array['Sal de ervas','Maionese verde'], 2),
    ('Doces', 'Chocolate com Morango', 'Chocolate ao leite, morangos frescos e fio de chocolate branco.', 4690, 'Grande · 8 fatias', array['Chocolate ao leite','Morango','Chocolate branco'], 1)
  ) as x(cat, name, descr, price, size_label, ingr, pos) on x.cat = c.name
  returning id, name, restaurant_id
)
insert into public.item_sizes (restaurant_id, item_id, label, note, price_delta_cents, is_default, position)
select i.restaurant_id, i.id, s.label, s.note, s.delta, s.def, s.pos
from i join (values
  ('Calabresa', 'Broto', '4 fatias', -1800, false, 1), ('Calabresa', 'Média', '6 fatias', -900, false, 2), ('Calabresa', 'Grande', '8 fatias', 0, true, 3),
  ('Pepperoni', 'Broto', '4 fatias', -1800, false, 1), ('Pepperoni', 'Média', '6 fatias', -900, false, 2), ('Pepperoni', 'Grande', '8 fatias', 0, true, 3),
  ('Funghi', 'Broto', '4 fatias', -1800, false, 1), ('Funghi', 'Média', '6 fatias', -900, false, 2), ('Funghi', 'Grande', '8 fatias', 0, true, 3),
  ('Burger Bacon Barbecue', 'Simples', '1 blend de 180 g', 0, true, 1), ('Burger Bacon Barbecue', 'Duplo', '2 blends de 180 g', 1400, false, 2),
  ('Batata Frita da Casa', 'Pequena', 'serve 1', -600, false, 1), ('Batata Frita da Casa', 'Média', 'serve 2', 0, true, 2), ('Batata Frita da Casa', 'Grande', 'serve 3 a 4', 900, false, 3),
  ('Chocolate com Morango', 'Broto', '4 fatias', -1800, false, 1), ('Chocolate com Morango', 'Grande', '8 fatias', 0, true, 2)
) as s(item, label, note, delta, def, pos) on s.item = i.name;

insert into public.item_extras (restaurant_id, item_id, name, price_cents, position)
select i.restaurant_id, i.id, e.name, e.price, e.pos
from public.items i join (values
  ('Calabresa', 'Borda de Catupiry', 900, 1), ('Calabresa', 'Borda de cheddar', 900, 2), ('Calabresa', 'Bacon', 800, 3),
  ('Pepperoni', 'Borda de Catupiry', 900, 1), ('Pepperoni', 'Dobro de queijo', 700, 2),
  ('Funghi', 'Borda de Catupiry', 900, 1), ('Funghi', 'Dobro de cogumelos', 800, 2),
  ('Burger Bacon Barbecue', 'Bacon extra', 600, 1), ('Burger Bacon Barbecue', 'Cheddar extra', 500, 2), ('Burger Bacon Barbecue', 'Ovo', 400, 3),
  ('Batata Frita da Casa', 'Cheddar e bacon', 900, 1),
  ('Chocolate com Morango', 'Leite Ninho', 600, 1)
) as e(item, name, price, pos) on e.item = i.name
where i.restaurant_id = (select id from public.restaurants where slug = 'forno-nero');
