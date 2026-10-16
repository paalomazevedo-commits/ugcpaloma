"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, Item, OrderMode, Restaurant } from "@/lib/types";
import { brl } from "@/lib/money";

type Line = {
  key: string;
  itemId: string;
  sizeId: string | null;
  extraIds: string[];
  removed: string[];
  notes: string;
  qty: number;
  // usados só para mostrar na tela; o servidor recalcula o preço
  name: string;
  desc: string;
  unit: number;
};

type Props = { restaurant: Restaurant; categories: Category[]; items: Item[]; table: string };

const initials = (s: string) => s.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const byPos = <T extends { position?: number }>(a: T, b: T) => (a.position ?? 0) - (b.position ?? 0);

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length < 3) return d;
  if (d.length < 8) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

function Video({ item }: { item: Item }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([e]) => (e.isIntersecting && e.intersectionRatio >= 0.6 ? v.play().catch(() => {}) : v.pause()),
      { threshold: [0, 0.6] },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);
  if (item.video_url)
    return (
      <video ref={ref} src={item.video_url} poster={item.poster_url ?? undefined} muted loop playsInline preload="metadata" />
    );
  if (item.poster_url) return <img src={item.poster_url} alt="" />;
  return <div className="ph">{initials(item.name)}</div>;
}

export default function Cardapio({ restaurant, categories, items, table }: Props) {
  const router = useRouter();
  const storageKey = `carrinho:${restaurant.slug}`;
  const [cat, setCat] = useState<string>("todas");
  const [cart, setCart] = useState<Line[]>([]);
  const [open, setOpen] = useState<null | { kind: "item"; item: Item } | { kind: "cart" } | { kind: "checkout" }>(null);

  // carrinho salvo só neste aparelho
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setCart(JSON.parse(raw));
    } catch {}
  }, [storageKey]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {}
  }, [cart, storageKey]);

  const visible = useMemo(
    () => items.filter((i) => cat === "todas" || i.category_id === cat),
    [items, cat],
  );
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const subtotal = cart.reduce((a, l) => a + l.unit * l.qty, 0);

  return (
    <div className="wrap">
      <header className="top">
        <div className="logo">{restaurant.logo_url ? <img src={restaurant.logo_url} alt="" /> : initials(restaurant.name)}</div>
        <div className="who">
          <b>{restaurant.name}</b>
          <small>
            <span className={`dot ${restaurant.is_open ? "" : "closed"}`} />
            {restaurant.is_open ? "Aberto agora" : "Fechado agora"}
            {table ? ` · Mesa ${table}` : ""}
          </small>
        </div>
      </header>

      {cat === "todas" && (restaurant.bio || restaurant.city) && (
        <section className="profile">
          {restaurant.bio && <p>{restaurant.bio}</p>}
          <p className="muted small">
            {restaurant.city}
            {restaurant.accepts_delivery ? ` · Entrega ${brl(restaurant.delivery_fee_cents)}` : ""}
          </p>
        </section>
      )}

      {categories.length > 0 && (
        <nav className="cats" aria-label="Categorias">
          <button aria-pressed={cat === "todas"} onClick={() => setCat("todas")}>Todas</button>
          {categories.map((c) => (
            <button key={c.id} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
              {c.name}
            </button>
          ))}
        </nav>
      )}

      {visible.map((it) => (
        <article className="post" key={it.id}>
          <div className="post-h">
            <div className="logo" style={{ width: 32, height: 32, fontSize: 11 }}>{initials(restaurant.name)}</div>
            <div>
              <b>{restaurant.name}</b>
              <small>{categories.find((c) => c.id === it.category_id)?.name ?? ""}</small>
            </div>
          </div>
          <div
            className="media"
            onClick={() => it.available && restaurant.is_open && setOpen({ kind: "item", item: it })}
            role="button"
            aria-label={`Pedir ${it.name}`}
          >
            <Video item={it} />
            {!it.available && <span className="off">Esgotado</span>}
          </div>
          <div className="pa">
            <span className="name">{it.name}</span>
            <button
              className="buy"
              disabled={!it.available || !restaurant.is_open}
              onClick={() => setOpen({ kind: "item", item: it })}
            >
              Pedir · {brl(it.price_cents)}
            </button>
          </div>
          <div className="pc">
            {it.description && <div>{it.description}</div>}
            {it.size_label && <div className="muted">{it.size_label}</div>}
          </div>
        </article>
      ))}
      {visible.length === 0 && <p className="muted" style={{ padding: 24, textAlign: "center" }}>Nenhum item nesta categoria.</p>}
      <div className="spacer" />

      {count > 0 && !open && (
        <button className="cartbar" onClick={() => setOpen({ kind: "cart" })}>
          <em>{count}</em>
          <span>Ver carrinho</span>
          <b>{brl(subtotal)}</b>
        </button>
      )}

      {open && <div className="backdrop" onClick={() => setOpen(null)} />}
      {open?.kind === "item" && (
        <ItemSheet
          item={open.item}
          onClose={() => setOpen(null)}
          onAdd={(l) => {
            setCart((c) => [...c, l]);
            setOpen(null);
          }}
        />
      )}
      {open?.kind === "cart" && (
        <CartSheet
          cart={cart}
          setCart={setCart}
          onClose={() => setOpen(null)}
          onNext={() => setOpen({ kind: "checkout" })}
        />
      )}
      {open?.kind === "checkout" && (
        <CheckoutSheet
          restaurant={restaurant}
          cart={cart}
          table={table}
          onBack={() => setOpen({ kind: "cart" })}
          onDone={(id, token) => {
            setCart([]);
            router.push(`/${restaurant.slug}/pedido/${id}?t=${token}`);
          }}
        />
      )}
    </div>
  );
}

function ItemSheet({ item, onClose, onAdd }: { item: Item; onClose: () => void; onAdd: (l: Line) => void }) {
  const sizes = [...item.item_sizes].sort(byPos);
  const extras = [...item.item_extras].sort(byPos);
  const [sizeId, setSizeId] = useState<string | null>(
    (sizes.find((s) => s.is_default) ?? sizes[0])?.id ?? null,
  );
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);
  const size = sizes.find((s) => s.id === sizeId);
  const unit =
    item.price_cents + (size?.price_delta_cents ?? 0) +
    extras.filter((e) => extraIds.includes(e.id)).reduce((a, e) => a + e.price_cents, 0);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const desc = [
    size?.label,
    removed.length ? `sem ${removed.join(", ").toLowerCase()}` : "",
    ...extras.filter((e) => extraIds.includes(e.id)).map((e) => `+ ${e.name.toLowerCase()}`),
    notes ? `"${notes}"` : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="sheet-h">
        <div>
          <h2>{item.name}</h2>
          {item.description && <p>{item.description}</p>}
        </div>
        <button className="x" onClick={onClose} aria-label="Fechar">×</button>
      </div>
      <div className="sheet-b">
        {sizes.length > 0 && (
          <div className="sec" role="radiogroup" aria-label="Tamanho">
            <h3>Tamanho</h3>
            {sizes.map((s) => (
              <button key={s.id} className="opt" role="radio" aria-checked={s.id === sizeId} onClick={() => setSizeId(s.id)}>
                <span className="l">{s.label}{s.note && <small>{s.note}</small>}</span>
                <span className="p">{brl(item.price_cents + s.price_delta_cents)}</span>
              </button>
            ))}
          </div>
        )}
        {item.ingredients.length > 0 && (
          <div className="sec">
            <h3>Tirar ingredientes</h3>
            <div className="chips">
              {item.ingredients.map((g) => (
                <button key={g} className="chip" aria-pressed={removed.includes(g)} onClick={() => setRemoved(toggle(removed, g))}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}
        {extras.length > 0 && (
          <div className="sec">
            <h3>Adicionais</h3>
            {extras.map((e) => (
              <button key={e.id} className="opt" role="checkbox" aria-checked={extraIds.includes(e.id)} onClick={() => setExtraIds(toggle(extraIds, e.id))}>
                <span className="l">{e.name}</span>
                <span className="p">+ {brl(e.price_cents)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="field">
          <label htmlFor="obs">Alguma observação?</label>
          <textarea id="obs" className="input" rows={2} maxLength={140} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="sheet-f">
        <div className="qty">
          <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Menos">−</button>
          <span>{qty}</span>
          <button onClick={() => setQty(Math.min(20, qty + 1))} aria-label="Mais">+</button>
        </div>
        <button
          className="cta"
          onClick={() =>
            onAdd({
              key: crypto.randomUUID(),
              itemId: item.id,
              sizeId,
              extraIds,
              removed,
              notes: notes.trim(),
              qty,
              name: item.name,
              desc,
              unit,
            })
          }
        >
          Adicionar <span>{brl(unit * qty)}</span>
        </button>
      </div>
    </div>
  );
}

function CartSheet({ cart, setCart, onClose, onNext }: {
  cart: Line[]; setCart: (f: (c: Line[]) => Line[]) => void; onClose: () => void; onNext: () => void;
}) {
  const subtotal = cart.reduce((a, l) => a + l.unit * l.qty, 0);
  const change = (key: string, d: number) =>
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0));
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Carrinho">
      <div className="sheet-h">
        <h2>Seu carrinho</h2>
        <button className="x" onClick={onClose} aria-label="Fechar">×</button>
      </div>
      <div className="sheet-b">
        {cart.length === 0 && <p className="muted">Seu carrinho está vazio.</p>}
        {cart.map((l) => (
          <div className="line" key={l.key}>
            <div className="d">
              <b>{l.name}</b>
              <small>{l.desc}</small>
            </div>
            <div style={{ textAlign: "right" }}>
              <b>{brl(l.unit * l.qty)}</b>
              <div className="qty" style={{ marginTop: 6 }}>
                <button onClick={() => change(l.key, -1)} aria-label="Menos">−</button>
                <span>{l.qty}</span>
                <button onClick={() => change(l.key, 1)} aria-label="Mais">+</button>
              </div>
            </div>
          </div>
        ))}
        <div className="sum"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
      </div>
      <div className="sheet-f">
        <button className="cta" disabled={!cart.length} onClick={onNext}>
          Finalizar <span>{brl(subtotal)}</span>
        </button>
      </div>
    </div>
  );
}

function CheckoutSheet({ restaurant, cart, table, onBack, onDone }: {
  restaurant: Restaurant; cart: Line[]; table: string; onBack: () => void; onDone: (id: string, token: string) => void;
}) {
  const modes: { k: OrderMode; label: string; on: boolean }[] = [
    { k: "entrega", label: "Entrega", on: restaurant.accepts_delivery },
    { k: "retirada", label: "Retirar", on: restaurant.accepts_pickup },
    { k: "mesa", label: "Na mesa", on: restaurant.accepts_table },
  ];
  const available = modes.filter((m) => m.on);
  const [mode, setMode] = useState<OrderMode>(table && restaurant.accepts_table ? "mesa" : available[0]?.k ?? "retirada");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [mesa, setMesa] = useState(table);
  const [payment, setPayment] = useState<"pix" | "cartao" | "dinheiro">("pix");
  const [change, setChange] = useState("");
  const [website, setWebsite] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const subtotal = cart.reduce((a, l) => a + l.unit * l.qty, 0);
  const fee = mode === "entrega" ? restaurant.delivery_fee_cents : 0;

  async function send() {
    setErr("");
    setSending(true);
    try {
      const res = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: restaurant.slug,
          mode,
          name,
          phone,
          address,
          table: mesa,
          payment,
          changeFor: payment === "dinheiro" && change ? Math.round(Number(change.replace(",", ".")) * 100) || null : null,
          lines: cart.map(({ itemId, sizeId, extraIds, removed, notes, qty }) => ({ itemId, sizeId, extraIds, removed, notes, qty })),
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível enviar o pedido.");
      onDone(data.id, data.token);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível enviar o pedido.");
      setSending(false);
    }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Finalizar pedido">
      <div className="sheet-h">
        <h2>Finalizar pedido</h2>
        <button className="x" onClick={onBack} aria-label="Voltar">×</button>
      </div>
      <div className="sheet-b">
        {available.length > 1 && (
          <div className="seg">
            {available.map((m) => (
              <button key={m.k} aria-pressed={mode === m.k} onClick={() => setMode(m.k)}>{m.label}</button>
            ))}
          </div>
        )}
        <div className="field">
          <label htmlFor="nome">Nome</label>
          <input id="nome" className="input" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tel">WhatsApp</label>
          <input id="tel" className="input" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 90000-0000" />
        </div>
        {mode === "entrega" && (
          <div className="field">
            <label htmlFor="end">Endereço de entrega</label>
            <input id="end" className="input" autoComplete="street-address" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, complemento, bairro" />
          </div>
        )}
        {mode === "mesa" && (
          <div className="field">
            <label htmlFor="mesa">Número da mesa</label>
            <input id="mesa" className="input" maxLength={10} value={mesa} onChange={(e) => setMesa(e.target.value)} />
          </div>
        )}
        <div className="seg" aria-label="Pagamento">
          <button aria-pressed={payment === "pix"} onClick={() => setPayment("pix")}>Pix</button>
          <button aria-pressed={payment === "cartao"} onClick={() => setPayment("cartao")}>Cartão</button>
          <button aria-pressed={payment === "dinheiro"} onClick={() => setPayment("dinheiro")}>Dinheiro</button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>O pagamento é feito direto ao restaurante na entrega ou no balcão.</p>
        {payment === "dinheiro" && (
          <div className="field">
            <label htmlFor="troco">Troco para quanto? (opcional)</label>
            <input id="troco" className="input" inputMode="decimal" value={change} onChange={(e) => setChange(e.target.value)} />
          </div>
        )}
        <div className="hp" aria-hidden="true">
          <label htmlFor="website">Não preencha</label>
          <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <div className="sum">
          <span>Subtotal</span><span>{brl(subtotal)}</span>
          <span>Entrega</span><span>{fee ? brl(fee) : "Grátis"}</span>
          <span className="t">Total</span><span className="t">{brl(subtotal + fee)}</span>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <p className="muted small" style={{ margin: 0 }}>
          Seu nome e WhatsApp vão só para o restaurante, para ele preparar e entregar o pedido.
        </p>
      </div>
      <div className="sheet-f">
        <button className="cta" disabled={sending} onClick={send}>
          {sending ? "Enviando…" : "Enviar pedido"} <span>{brl(subtotal + fee)}</span>
        </button>
      </div>
    </div>
  );
}
