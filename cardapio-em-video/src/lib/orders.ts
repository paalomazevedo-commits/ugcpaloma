import "server-only";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export function sameToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Busca um pedido para a tela de acompanhamento do cliente.
// Só devolve se o código secreto do link bater; nunca expõe o telefone.
export async function getPublicOrder(id: string, token: string) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{36}$/.test(token)) return null;
  const db = supabaseAdmin();
  const { data } = await db
    .from("orders")
    .select(
      "id, number, public_token, status, mode, customer_name, total_cents, payment_method, created_at, restaurants(name, slug), order_items(name, size_label, removed, extras, notes, qty, unit_price_cents)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data || !sameToken(data.public_token, token)) return null;
  const { public_token: _omit, ...rest } = data;
  return rest;
}
