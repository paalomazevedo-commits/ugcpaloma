import { NextResponse } from "next/server";
import { orderSchema } from "@/lib/validation";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MAX_BODY_BYTES = 20_000;
const MAX_OPEN_ORDERS_PER_PHONE = 3;

type DbItem = {
  id: string;
  name: string;
  price_cents: number;
  ingredients: string[];
  available: boolean;
  item_sizes: { id: string; label: string; price_delta_cents: number }[];
  item_extras: { id: string; name: string; price_cents: number }[];
};

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return fail(413, "Pedido grande demais.");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Não foi possível ler o pedido.");
  }
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) return fail(422, parsed.error.issues[0]?.message ?? "Confira os dados do pedido.");
  const o = parsed.data;

  const db = supabaseAdmin();
  const { data: rest } = await db
    .from("restaurants")
    .select("id, is_open, status, delivery_fee_cents, accepts_delivery, accepts_pickup, accepts_table")
    .eq("slug", o.slug)
    .maybeSingle();
  if (!rest || rest.status !== "active") return fail(404, "Restaurante não encontrado.");
  if (!rest.is_open) return fail(409, "O restaurante está fechado agora.");
  const modeOk =
    (o.mode === "entrega" && rest.accepts_delivery) ||
    (o.mode === "retirada" && rest.accepts_pickup) ||
    (o.mode === "mesa" && rest.accepts_table);
  if (!modeOk) return fail(422, "Esta forma de pedido não está disponível.");

  // Limite contra pedidos falsos em série do mesmo número
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", rest.id)
    .eq("customer_phone", o.phone)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_OPEN_ORDERS_PER_PHONE)
    return fail(429, "Muitos pedidos seguidos deste número. Fale com o restaurante pelo WhatsApp.");

  // Preços SEMPRE recalculados aqui, a partir do banco. O valor enviado pelo celular é ignorado.
  const ids = [...new Set(o.lines.map((l) => l.itemId))];
  const { data: items } = await db
    .from("items")
    .select("id, name, price_cents, ingredients, available, item_sizes(id, label, price_delta_cents), item_extras(id, name, price_cents)")
    .eq("restaurant_id", rest.id)
    .in("id", ids);
  const byId = new Map((items as DbItem[] | null ?? []).map((i) => [i.id, i]));

  const lines = [];
  for (const l of o.lines) {
    const it = byId.get(l.itemId);
    if (!it || !it.available) return fail(409, "Um dos itens não está mais disponível. Atualize o cardápio.");
    const size = l.sizeId ? it.item_sizes.find((s) => s.id === l.sizeId) : null;
    if (l.sizeId && !size) return fail(422, "Tamanho inválido.");
    if (!l.sizeId && it.item_sizes.length) return fail(422, `Escolha o tamanho de ${it.name}.`);
    const extras = l.extraIds.map((eid) => it.item_extras.find((e) => e.id === eid));
    if (extras.some((e) => !e)) return fail(422, "Adicional inválido.");
    if (l.removed.some((r) => !it.ingredients.includes(r))) return fail(422, "Ingrediente inválido.");
    const unit =
      it.price_cents + (size?.price_delta_cents ?? 0) + extras.reduce((a, e) => a + (e?.price_cents ?? 0), 0);
    if (unit < 0) return fail(422, "Preço inválido.");
    lines.push({
      item_id: it.id,
      name: it.name,
      size_label: size?.label ?? null,
      removed: l.removed,
      extras: extras.map((e) => ({ name: e!.name, price_cents: e!.price_cents })),
      notes: l.notes || null,
      qty: l.qty,
      unit_price_cents: unit,
    });
  }

  const subtotal = lines.reduce((a, l) => a + l.unit_price_cents * l.qty, 0);
  const fee = o.mode === "entrega" ? rest.delivery_fee_cents : 0;
  const total = subtotal + fee;
  if (o.payment === "dinheiro" && o.changeFor !== null && o.changeFor < total)
    return fail(422, "O troco precisa ser maior que o total.");

  const { data: num, error: numErr } = await db.rpc("next_order_number", { rid: rest.id });
  if (numErr || typeof num !== "number") return fail(500, "Não foi possível registrar o pedido. Tente de novo.");

  const { data: order, error } = await db
    .from("orders")
    .insert({
      restaurant_id: rest.id,
      number: num,
      mode: o.mode,
      customer_name: o.name,
      customer_phone: o.phone,
      address: o.mode === "entrega" ? o.address : null,
      table_number: o.mode === "mesa" ? o.table : null,
      payment_method: o.payment,
      change_for_cents: o.payment === "dinheiro" ? o.changeFor : null,
      subtotal_cents: subtotal,
      delivery_fee_cents: fee,
      total_cents: total,
    })
    .select("id, public_token, number")
    .single();
  if (error || !order) return fail(500, "Não foi possível registrar o pedido. Tente de novo.");

  const { error: linesErr } = await db
    .from("order_items")
    .insert(lines.map((l) => ({ ...l, order_id: order.id, restaurant_id: rest.id })));
  if (linesErr) {
    await db.from("orders").delete().eq("id", order.id);
    return fail(500, "Não foi possível registrar o pedido. Tente de novo.");
  }

  return NextResponse.json({ id: order.id, token: order.public_token, number: order.number }, { status: 201 });
}
