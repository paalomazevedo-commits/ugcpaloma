import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMemberships } from "@/lib/membership";
import EditorCardapio from "@/components/EditorCardapio";
import type { Category, Item } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cardápio", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { db } = await requireUser();
  const list = await getMemberships(db);
  if (!list.length) redirect("/painel");
  const sp = await searchParams;
  const current = list.find((m) => m.restaurants.id === sp.r) ?? list[0];
  const rid = current.restaurants.id;
  const [{ data: categories }, { data: items }] = await Promise.all([
    db.from("categories").select("id, name, position").eq("restaurant_id", rid).order("position"),
    db
      .from("items")
      .select("id, category_id, name, description, price_cents, size_label, video_url, poster_url, ingredients, available, position, item_sizes(id, label, note, price_delta_cents, is_default, position), item_extras(id, name, price_cents, position)")
      .eq("restaurant_id", rid)
      .order("position"),
  ]);
  return (
    <main className="wide">
      <div className="panel-top">
        <h1>Cardápio · {current.restaurants.name}</h1>
        <span style={{ flex: 1 }} />
        <Link className="small" href={`/painel?r=${rid}`}>Pedidos</Link>
        <Link className="small" href={`/${current.restaurants.slug}`} target="_blank">Ver como cliente</Link>
      </div>
      <EditorCardapio
        restaurantId={rid}
        canManage={current.role !== "staff"}
        categories={(categories ?? []) as Category[]}
        items={(items ?? []) as unknown as Item[]}
      />
    </main>
  );
}
