import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function requireUser() {
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/painel/login");
  return { db, user: data.user };
}

export async function requirePlatformAdmin() {
  const { db, user } = await requireUser();
  const { data: isAdmin } = await db.rpc("is_platform_admin");
  if (isAdmin !== true) redirect("/painel");
  return { db, user };
}
