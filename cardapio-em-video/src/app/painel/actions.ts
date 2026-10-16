"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/types";

const NEXT: Record<string, OrderStatus[]> = {
  novo: ["preparo", "recusado"],
  preparo: ["saiu", "pronto"],
  saiu: ["concluido"],
  pronto: ["concluido"],
};

export async function setOrderStatus(orderId: string, status: OrderStatus) {
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return { error: "Pedido inválido." };
  const db = await supabaseServer();
  // A RLS garante que só a equipe do restaurante dono do pedido consegue ler e mudar.
  const { data: order } = await db.from("orders").select("status").eq("id", orderId).maybeSingle();
  if (!order) return { error: "Pedido não encontrado." };
  if (!NEXT[order.status]?.includes(status)) return { error: "Mudança de situação não permitida." };
  const { error } = await db.from("orders").update({ status }).eq("id", orderId);
  if (error) return { error: "Não foi possível atualizar." };
  revalidatePath("/painel");
  return { ok: true };
}

export async function setOpen(restaurantId: string, open: boolean) {
  const db = await supabaseServer();
  const { error } = await db.from("restaurants").update({ is_open: open }).eq("id", restaurantId);
  if (error) return { error: "Só o dono ou gerente pode abrir e fechar a loja." };
  revalidatePath("/painel");
  return { ok: true };
}

export async function signOut() {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect("/painel/login");
}
