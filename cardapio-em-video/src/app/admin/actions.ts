"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type CreateState = { error?: string; slug?: string; tempPassword?: string; linked?: boolean } | null;

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/),
  email: z.string().trim().toLowerCase().email().max(200),
  city: z.string().trim().max(80),
});

export async function createRestaurant(_prev: CreateState, formData: FormData): Promise<CreateState> {
  await requirePlatformAdmin(); // confere de novo no servidor, não confia na tela
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: "Confira os campos: nome, endereço (só letras minúsculas, números e hífen) e e-mail." };
  const { name, slug, email, city } = parsed.data;
  const db = supabaseAdmin();

  const { data: rest, error: rErr } = await db
    .from("restaurants")
    .insert({ name, slug, city: city || null })
    .select("id")
    .single();
  if (rErr || !rest) return { error: "Esse endereço de cardápio já está em uso. Escolha outro." };

  // Senha provisória forte, mostrada uma única vez na tela. O dono troca no primeiro acesso.
  const temp = randomBytes(12).toString("base64url");
  let userId: string | null = null;
  const { data: created } = await db.auth.admin.createUser({ email, password: temp, email_confirm: true });
  if (created?.user) userId = created.user.id;
  else {
    // o e-mail já tem conta: liga a conta existente, sem mexer na senha dela
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
      userId = data?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
      if (!data || data.users.length < 200) break;
    }
  }
  if (!userId) {
    await db.from("restaurants").delete().eq("id", rest.id);
    return { error: "Não foi possível criar ou encontrar a conta desse e-mail." };
  }
  const { error: mErr } = await db
    .from("restaurant_members")
    .insert({ restaurant_id: rest.id, user_id: userId, role: "owner" });
  if (mErr) return { error: "O restaurante foi criado, mas não foi possível ligar o dono. Tente de novo." };

  revalidatePath("/admin");
  return created?.user ? { slug, tempPassword: temp } : { slug, linked: true };
}
