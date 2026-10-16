import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicOrder } from "@/lib/orders";
import { brl } from "@/lib/money";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seu pedido", robots: { index: false } };

const FLOW = {
  entrega: [["novo", "Pedido recebido"], ["preparo", "Em preparo"], ["saiu", "Saiu para entrega"], ["concluido", "Entregue"]],
  retirada: [["novo", "Pedido recebido"], ["preparo", "Em preparo"], ["pronto", "Pronto para retirar"], ["concluido", "Retirado"]],
  mesa: [["novo", "Pedido recebido"], ["preparo", "Em preparo"], ["pronto", "Indo para a mesa"], ["concluido", "Servido"]],
} as const;

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ t?: string }> };

export default async function Page({ params, searchParams }: Props) {
  const { slug, id } = await params;
  const order = await getPublicOrder(id, (await searchParams).t ?? "");
  const rest = order?.restaurants as unknown as { name: string; slug: string } | null;
  if (!order || rest?.slug !== slug) notFound();

  const flow = FLOW[order.mode as keyof typeof FLOW];
  const cur = flow.findIndex(([k]) => k === order.status);
  const final = order.status === "concluido" || order.status === "recusado";
  type Line = { name: string; size_label: string | null; removed: string[]; extras: { name: string }[]; notes: string | null; qty: number; unit_price_cents: number };

  return (
    <main className="wrap track">
      {!final && <AutoRefresh seconds={8} />}
      <span className="muted small">{rest.name} · Pedido #{order.number}</span>
      {order.status === "recusado" ? (
        <h1>O restaurante não conseguiu aceitar seu pedido. Ele vai falar com você pelo WhatsApp.</h1>
      ) : (
        <>
          <h1>{order.status === "concluido" ? "Pedido finalizado" : `Recebemos seu pedido, ${order.customer_name.split(" ")[0]}!`}</h1>
          <ol className="steps">
            {flow.map(([k, label], i) => (
              <li key={k} className={i < cur || order.status === "concluido" ? "done" : i === cur ? "now" : ""}>
                <i />
                {label}
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="card">
        {(order.order_items as Line[]).map((l, i) => (
          <div key={i}>
            <b>{l.qty}× {l.name}</b>{" "}
            <span className="muted small">
              {[l.size_label, l.removed.length ? `sem ${l.removed.join(", ").toLowerCase()}` : "", ...l.extras.map((e) => `+ ${e.name.toLowerCase()}`), l.notes ? `"${l.notes}"` : ""].filter(Boolean).join(" · ")}
            </span>
          </div>
        ))}
        <div className="sum">
          <span className="t">Total</span>
          <span className="t">{brl(order.total_cents)}</span>
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Guarde este link para acompanhar o pedido. A página se atualiza sozinha.
      </p>
      <Link className="btn ghost block" href={`/${rest.slug}`}>Voltar ao cardápio</Link>
    </main>
  );
}
