import Link from "next/link";
import { requireUser } from "@/lib/auth";
import PedidosBoard, { type PanelOrder } from "@/components/PedidosBoard";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedidos", robots: { index: false } };

export default async function Painel({ searchParams }: { searchParams: Promise<{ r?: string; senha?: string }> }) {
  const { db } = await requireUser();
  const sp = await searchParams;
  const { data: memberships } = await db
    .from("restaurant_members")
    .select("role, restaurants(id, name, slug, is_open)")
    .order("created_at");
  type M = { role: string; restaurants: { id: string; name: string; slug: string; is_open: boolean } };
  const list = (memberships ?? []) as unknown as M[];
  const { data: isAdmin } = await db.rpc("is_platform_admin");

  if (!list.length)
    return (
      <main className="auth">
        <h1 style={{ margin: 0 }}>Nenhum restaurante ligado à sua conta</h1>
        <p className="muted" style={{ margin: 0 }}>Peça para o dono do restaurante ou para o suporte liberar seu acesso.</p>
        {isAdmin === true && <Link className="btn" href="/admin">Ir para o admin da plataforma</Link>}
        <form action={signOut}><button className="btn ghost block">Sair</button></form>
      </main>
    );

  const current = list.find((m) => m.restaurants.id === sp.r) ?? list[0];
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const { data: orders } = await db
    .from("orders")
    .select("id, number, status, mode, customer_name, customer_phone, address, table_number, payment_method, change_for_cents, total_cents, created_at, order_items(name, size_label, removed, extras, notes, qty)")
    .eq("restaurant_id", current.restaurants.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <main className="wide">
      <div className="panel-top">
        <h1>{current.restaurants.name}</h1>
        <Link className="small" href={`/${current.restaurants.slug}`} target="_blank">Ver cardápio</Link>
        <span style={{ flex: 1 }} />
        {isAdmin === true && <Link className="small" href="/admin">Admin</Link>}
        <Link className="small" href="/painel/senha">Trocar senha</Link>
        <form action={signOut}><button className="small" style={{ textDecoration: "underline" }}>Sair</button></form>
      </div>
      {sp.senha === "ok" && <p className="ok small">Senha trocada.</p>}
      {list.length > 1 && (
        <p className="small">
          Restaurantes:{" "}
          {list.map((m) => (
            <Link key={m.restaurants.id} href={`/painel?r=${m.restaurants.id}`} style={{ marginRight: 10 }}>
              {m.restaurants.name}
            </Link>
          ))}
        </p>
      )}
      <PedidosBoard
        restaurantId={current.restaurants.id}
        isOpen={current.restaurants.is_open}
        canManage={current.role !== "staff"}
        orders={(orders ?? []) as unknown as PanelOrder[]}
      />
    </main>
  );
}
