"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { brl } from "@/lib/money";
import { setOpen, setOrderStatus } from "@/app/painel/actions";
import type { OrderStatus } from "@/lib/types";

export type PanelOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  mode: "entrega" | "retirada" | "mesa";
  customer_name: string;
  customer_phone: string;
  address: string | null;
  table_number: string | null;
  payment_method: "pix" | "cartao" | "dinheiro";
  change_for_cents: number | null;
  total_cents: number;
  created_at: string;
  order_items: { name: string; size_label: string | null; removed: string[]; extras: { name: string }[]; notes: string | null; qty: number }[];
};

const LANES: [string, string, OrderStatus[]][] = [
  ["novo", "Novos", ["novo"]],
  ["preparo", "Em preparo", ["preparo"]],
  ["saiu", "Saiu / pronto", ["saiu", "pronto"]],
  ["concluido", "Finalizados", ["concluido", "recusado"]],
];
const PAY = { pix: "Pix", cartao: "Cartão", dinheiro: "Dinheiro" };
const phoneFmt = (p: string) => (p.length === 11 ? `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}` : `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}`);

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {}
}

export default function PedidosBoard({ restaurantId, isOpen, canManage, orders }: {
  restaurantId: string; isOpen: boolean; canManage: boolean; orders: PanelOrder[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [live, setLive] = useState(false);
  const known = useRef(new Set(orders.map((o) => o.id)));

  // Pedidos novos chegam em tempo real (a RLS filtra só os deste restaurante)
  useEffect(() => {
    const db = supabaseBrowser();
    const ch = db
      .channel(`orders-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, (p) => {
        const id = (p.new as { id?: string })?.id;
        if (p.eventType === "INSERT" && id && !known.current.has(id)) {
          known.current.add(id);
          beep();
        }
        router.refresh();
      })
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    // reserva: atualiza a cada 30 s se a conexão em tempo real cair
    const t = setInterval(() => router.refresh(), 30000);
    return () => {
      clearInterval(t);
      db.removeChannel(ch);
    };
  }, [restaurantId, router]);

  const act = (id: string, status: OrderStatus) =>
    start(async () => {
      setErr("");
      const r = await setOrderStatus(id, status);
      if (r?.error) setErr(r.error);
    });

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <span className="small"><span className={`dot ${live ? "" : "closed"}`} />{live ? "Recebendo pedidos ao vivo" : "Conectando…"}</span>
        {canManage && (
          <button className="btn ghost" disabled={pending} onClick={() => start(async () => { const r = await setOpen(restaurantId, !isOpen); if (r?.error) setErr(r.error); })}>
            {isOpen ? "Loja aberta · fechar" : "Loja fechada · abrir"}
          </button>
        )}
        {err && <span className="err" role="alert">{err}</span>}
      </div>
      <div className="lanes">
        {LANES.map(([k, label, statuses]) => {
          const list = orders.filter((o) => statuses.includes(o.status));
          return (
            <section className="lane" key={k}>
              <h2>{label} ({list.length})</h2>
              {list.length === 0 && <div className="empty">Nenhum pedido</div>}
              {list.map((o) => (
                <article key={o.id} className={`oc ${o.status}`}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <b>#{o.number}</b>
                    <span className="muted small">{new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div>
                    <b>{o.customer_name}</b>
                    <div className="small">{phoneFmt(o.customer_phone)}</div>
                    <div className="small">
                      <span className="tag">{o.mode.toUpperCase()}</span>
                      {o.mode === "entrega" ? o.address : o.mode === "mesa" ? `Mesa ${o.table_number}` : "Cliente busca no balcão"}
                    </div>
                  </div>
                  <ul>
                    {o.order_items.map((l, i) => (
                      <li key={i}>
                        <b>{l.qty}× {l.name}</b> {l.size_label && <span className="muted">({l.size_label})</span>}
                        {l.removed.length > 0 && <div className="small rm">SEM {l.removed.join(", ").toUpperCase()}</div>}
                        {l.extras.map((e, j) => <div key={j} className="small">+ {e.name}</div>)}
                        {l.notes && <div className="small">Obs.: {l.notes}</div>}
                      </li>
                    ))}
                  </ul>
                  <div className="t">
                    <span>{PAY[o.payment_method]}{o.change_for_cents ? ` · troco p/ ${brl(o.change_for_cents)}` : ""}</span>
                    <span>{brl(o.total_cents)}</span>
                  </div>
                  <div className="acts">
                    {o.status === "novo" && (<><button disabled={pending} onClick={() => act(o.id, "recusado")}>Recusar</button><button className="go" disabled={pending} onClick={() => act(o.id, "preparo")}>Aceitar</button></>)}
                    {o.status === "preparo" && <button className="go" disabled={pending} onClick={() => act(o.id, o.mode === "entrega" ? "saiu" : "pronto")}>{o.mode === "entrega" ? "Saiu para entrega" : o.mode === "mesa" ? "Levar à mesa" : "Pronto para retirar"}</button>}
                    {(o.status === "saiu" || o.status === "pronto") && <button className="go" disabled={pending} onClick={() => act(o.id, "concluido")}>Finalizar</button>}
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
