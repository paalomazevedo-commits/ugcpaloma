import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

// Cliente com a chave secreta: ignora a RLS. Use só no servidor, só depois de
// validar quem pede e o que pede. Nunca importe este arquivo num componente "use client".
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Variável de ambiente ausente: SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(SUPABASE_URL(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
