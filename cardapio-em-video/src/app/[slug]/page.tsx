import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import Cardapio from "@/components/Cardapio";
import type { Category, Item, Restaurant } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ mesa?: string }> };

async function load(slug: string) {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const db = await supabaseServer();
  const { data: restaurant } = await db
    .from("restaurants")
    .select("id, slug, name, bio, city, logo_url, delivery_fee_cents, accepts_delivery, accepts_pickup, accepts_table, is_open")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (!restaurant) return null;
  const [{ data: categories }, { data: items }] = await Promise.all([
    db.from("categories").select("id, name").eq("restaurant_id", restaurant.id).order("position"),
    db
      .from("items")
      .select(
        "id, category_id, name, description, price_cents, size_label, video_url, poster_url, ingredients, available, item_sizes(id, label, note, price_delta_cents, is_default, position), item_extras(id, name, price_cents, position)",
      )
      .eq("restaurant_id", restaurant.id)
      .order("position"),
  ]);
  return {
    restaurant: restaurant as Restaurant,
    categories: (categories ?? []) as Category[],
    items: (items ?? []) as unknown as Item[],
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).slug);
  return data ? { title: data.restaurant.name, description: data.restaurant.bio ?? undefined } : {};
}

export default async function Page({ params, searchParams }: Props) {
  const data = await load((await params).slug);
  if (!data) notFound();
  const mesa = (await searchParams).mesa?.replace(/[^0-9A-Za-z]/g, "").slice(0, 10) ?? "";
  return <Cardapio {...data} table={mesa} />;
}
