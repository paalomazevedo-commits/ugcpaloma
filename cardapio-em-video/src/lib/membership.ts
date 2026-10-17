import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Membership = { role: "owner" | "manager" | "staff"; restaurants: { id: string; name: string; slug: string; is_open: boolean } };

export async function getMemberships(db: SupabaseClient) {
  const { data } = await db
    .from("restaurant_members")
    .select("role, restaurants(id, name, slug, is_open)")
    .order("created_at");
  return (data ?? []) as unknown as Membership[];
}
