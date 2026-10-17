"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { brl } from "@/lib/money";
import type { Category, Item } from "@/lib/types";

const MAX_VIDEO_MB = 50;
const BUCKET = "midia";

type SizeRow = { label: string; note: string; delta: string; is_default: boolean };
type ExtraRow = { name: string; price: string };
type Draft = {
  id: string | null;
  name: string;
  description: string;
  price: string;
  size_label: string;
  category_id: string;
  ingredients: string;
  available: boolean;
  sizes: SizeRow[];
  extras: ExtraRow[];
  video_url: string | null;
  poster_url: string | null;
};

// "54,90" -> 5490 ; aceita "54.90" e "54"
function toCents(v: string): number | null {
  const clean = v.trim().replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
const fromCents = (c: number) => (c / 100).toFixed(2).replace(".", ",");

function toDraft(it: Item | null, firstCategory: string): Draft {
  if (!it)
    return {
      id: null, name: "", description: "", price: "", size_label: "", category_id: firstCategory,
      ingredients: "", available: true, sizes: [], extras: [], video_url: null, poster_url: null,
    };
  return {
    id: it.id,
    name: it.name,
    description: it.description ?? "",
    price: fromCents(it.price_cents),
    size_label: it.size_label ?? "",
    category_id: it.category_id ?? "",
    ingredients: it.ingredients.join(", "),
    available: it.available,
    sizes: [...it.item_sizes]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((s) => ({ label: s.label, note: s.note ?? "", delta: fromCents(s.price_delta_cents), is_default: s.is_default })),
    extras: [...it.item_extras]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((e) => ({ name: e.name, price: fromCents(e.price_cents) })),
    video_url: it.video_url,
    poster_url: it.poster_url,
  };
}

// Tira uma foto do vídeo (no segundo 1) para servir de capa enquanto ele carrega
function makePoster(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (b: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve(b);
    };
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    v.onloadeddata = () => {
      v.currentTime = Math.min(1, (v.duration || 2) / 2);
    };
    v.onseeked = () => {
      const w = Math.min(720, v.videoWidth || 720);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = Math.round(((v.videoHeight || 1280) * w) / (v.videoWidth || 720));
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => done(b), "image/jpeg", 0.8);
    };
    v.onerror = () => done(null);
    setTimeout(() => done(null), 15000);
  });
}

// caminho do arquivo dentro do bucket, a partir do endereço público
function pathFromUrl(url: string | null) {
  if (!url) return null;
  const i = url.indexOf(`/object/public/${BUCKET}/`);
  return i < 0 ? null : decodeURIComponent(url.slice(i + `/object/public/${BUCKET}/`.length));
}

export default function EditorCardapio({ restaurantId, canManage, categories, items }: {
  restaurantId: string; canManage: boolean; categories: Category[]; items: Item[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [newCat, setNewCat] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const db = supabaseBrowser();
  const say = (kind: "ok" | "err", text: string) => setMsg({ kind, text });

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const ok = await fn();
      if (ok) say("ok", ok);
      router.refresh();
    } catch (e) {
      say("err", e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const addCategory = () =>
    run(async () => {
      const name = newCat.trim();
      if (!name) throw new Error("Escreva o nome da categoria.");
      const { error } = await db.from("categories").insert({ restaurant_id: restaurantId, name, position: categories.length + 1 });
      if (error) throw new Error("Não foi possível criar a categoria.");
      setNewCat("");
      return "Categoria criada.";
    });

  const renameCategory = (c: Category, name: string) =>
    run(async () => {
      if (!name.trim() || name.trim() === c.name) return;
      const { error } = await db.from("categories").update({ name: name.trim() }).eq("id", c.id);
      if (error) throw new Error("Não foi possível renomear.");
      return "Categoria renomeada.";
    });

  const deleteCategory = (c: Category) =>
    run(async () => {
      const { error } = await db.from("categories").delete().eq("id", c.id);
      if (error) throw new Error("Não foi possível apagar a categoria.");
      return "Categoria apagada. Os itens dela ficaram sem categoria.";
    });

  const toggleAvailable = (it: Item) =>
    run(async () => {
      const { error } = await db.from("items").update({ available: !it.available }).eq("id", it.id);
      if (error) throw new Error("Não foi possível mudar a disponibilidade.");
      return it.available ? `${it.name} marcado como esgotado.` : `${it.name} disponível de novo.`;
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!canManage && <p className="muted">Você pode ver o cardápio, mas só o dono ou o gerente fazem alterações.</p>}
      {msg && <p className={msg.kind === "ok" ? "ok" : "err"} role={msg.kind === "err" ? "alert" : "status"}>{msg.text}</p>}

      <section className="card">
        <h2 style={{ margin: 0, fontSize: 17 }}>Categorias</h2>
        {categories.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              className="input"
              defaultValue={c.name}
              disabled={!canManage || busy}
              aria-label={`Nome da categoria ${c.name}`}
              onBlur={(e) => renameCategory(c, e.target.value)}
              maxLength={40}
            />
            {canManage && <button className="btn ghost" disabled={busy} onClick={() => deleteCategory(c)}>Apagar</button>}
          </div>
        ))}
        {canManage && (
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" placeholder="Nova categoria, ex.: Pizzas doces" value={newCat} maxLength={40} onChange={(e) => setNewCat(e.target.value)} />
            <button className="btn" disabled={busy} onClick={addCategory}>Adicionar</button>
          </div>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17, flex: 1 }}>Itens ({items.length})</h2>
          {canManage && <button className="btn" onClick={() => setEditing(toDraft(null, categories[0]?.id ?? ""))}>Novo item</button>}
        </div>
        {items.length === 0 && <div className="empty">Nenhum item ainda. Clique em Novo item para começar.</div>}
        {items.map((it) => (
          <div key={it.id} className="card" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <div style={{ width: 56, height: 70, borderRadius: 8, overflow: "hidden", background: "#1a110c", flex: "none" }}>
              {it.poster_url && <img src={it.poster_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{it.name}</b>
              <div className="small muted">
                {brl(it.price_cents)} · {categories.find((c) => c.id === it.category_id)?.name ?? "Sem categoria"} ·{" "}
                {it.video_url ? "com vídeo" : "sem vídeo"}
              </div>
              {!it.available && <div className="small err">Esgotado</div>}
            </div>
            {canManage && (
              <>
                <button className="btn ghost" disabled={busy} onClick={() => toggleAvailable(it)}>
                  {it.available ? "Esgotar" : "Disponibilizar"}
                </button>
                <button className="btn" onClick={() => setEditing(toDraft(it, ""))}>Editar</button>
              </>
            )}
          </div>
        ))}
      </section>

      {editing && (
        <ItemForm
          draft={editing}
          categories={categories}
          restaurantId={restaurantId}
          position={items.length + 1}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            say("ok", text);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ItemForm({ draft, categories, restaurantId, position, onClose, onSaved }: {
  draft: Draft; categories: Category[]; restaurantId: string; position: number;
  onClose: () => void; onSaved: (msg: string) => void;
}) {
  const db = supabaseBrowser();
  const [d, setD] = useState<Draft>(draft);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [step, setStep] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  function pickFile(f: File | null) {
    setErr("");
    if (!f) return setFile(null);
    if (!f.type.startsWith("video/")) return setErr("Escolha um arquivo de vídeo.");
    if (f.size > MAX_VIDEO_MB * 1024 * 1024) return setErr(`O vídeo passa de ${MAX_VIDEO_MB} MB. Encurte ou comprima antes de enviar.`);
    setFile(f);
  }

  async function save() {
    setErr("");
    const price = toCents(d.price);
    if (d.name.trim().length < 2) return setErr("Escreva o nome do item.");
    if (price === null || price < 100) return setErr("Informe um preço válido, por exemplo 54,90.");
    const sizes = d.sizes.filter((s) => s.label.trim());
    const extras = d.extras.filter((e) => e.name.trim());
    for (const s of sizes) if (toCents(s.delta || "0") === null) return setErr(`Diferença de preço inválida no tamanho ${s.label}.`);
    for (const e of extras) if (toCents(e.price || "0") === null) return setErr(`Preço inválido no adicional ${e.name}.`);
    if (sizes.length && !sizes.some((s) => s.is_default)) sizes[0].is_default = true;

    const row = {
      restaurant_id: restaurantId,
      name: d.name.trim(),
      description: d.description.trim() || null,
      price_cents: price,
      size_label: d.size_label.trim() || null,
      category_id: d.category_id || null,
      ingredients: d.ingredients.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20),
      available: d.available,
    };

    try {
      setStep("Salvando o item…");
      let id = d.id;
      if (id) {
        const { error } = await db.from("items").update(row).eq("id", id);
        if (error) throw new Error("Não foi possível salvar o item.");
      } else {
        const { data, error } = await db.from("items").insert({ ...row, position }).select("id").single();
        if (error || !data) throw new Error("Não foi possível criar o item.");
        id = data.id as string;
      }

      setStep("Salvando tamanhos e adicionais…");
      await db.from("item_sizes").delete().eq("item_id", id);
      await db.from("item_extras").delete().eq("item_id", id);
      if (sizes.length) {
        const { error } = await db.from("item_sizes").insert(
          sizes.map((s, i) => ({
            restaurant_id: restaurantId, item_id: id, label: s.label.trim(), note: s.note.trim() || null,
            price_delta_cents: toCents(s.delta || "0") ?? 0, is_default: s.is_default, position: i + 1,
          })),
        );
        if (error) throw new Error("Não foi possível salvar os tamanhos.");
      }
      if (extras.length) {
        const { error } = await db.from("item_extras").insert(
          extras.map((e, i) => ({
            restaurant_id: restaurantId, item_id: id, name: e.name.trim(), price_cents: toCents(e.price || "0") ?? 0, position: i + 1,
          })),
        );
        if (error) throw new Error("Não foi possível salvar os adicionais.");
      }

      if (file) {
        setStep("Enviando o vídeo… pode levar alguns segundos");
        const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
        const stamp = Date.now();
        const base = `${restaurantId}/${id}/${stamp}`;
        const up = await db.storage.from(BUCKET).upload(`${base}.${ext}`, file, { contentType: file.type, cacheControl: "31536000" });
        if (up.error) throw new Error("Não foi possível enviar o vídeo. Tente um arquivo menor.");
        const videoUrl = db.storage.from(BUCKET).getPublicUrl(`${base}.${ext}`).data.publicUrl;

        setStep("Gerando a capa do vídeo…");
        let posterUrl: string | null = null;
        const poster = await makePoster(file);
        if (poster) {
          const pu = await db.storage.from(BUCKET).upload(`${base}.jpg`, poster, { contentType: "image/jpeg", cacheControl: "31536000" });
          if (!pu.error) posterUrl = db.storage.from(BUCKET).getPublicUrl(`${base}.jpg`).data.publicUrl;
        }
        const { error } = await db.from("items").update({ video_url: videoUrl, poster_url: posterUrl }).eq("id", id);
        if (error) throw new Error("O vídeo foi enviado, mas não foi ligado ao item. Tente salvar de novo.");
        // apaga os arquivos antigos deste item
        const old = [pathFromUrl(d.video_url), pathFromUrl(d.poster_url)].filter(Boolean) as string[];
        if (old.length) await db.storage.from(BUCKET).remove(old);
      }
      onSaved(d.id ? "Item atualizado." : "Item criado.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");
      setStep("");
    }
  }

  async function remove() {
    if (!d.id) return onClose();
    setStep("Apagando…");
    const { error } = await db.from("items").delete().eq("id", d.id);
    if (error) {
      setStep("");
      return setErr("Não foi possível apagar o item.");
    }
    const old = [pathFromUrl(d.video_url), pathFromUrl(d.poster_url)].filter(Boolean) as string[];
    if (old.length) await db.storage.from(BUCKET).remove(old);
    onSaved("Item apagado.");
  }

  const [confirmDel, setConfirmDel] = useState(false);
  const busy = !!step;

  return (
    <>
      <div className="backdrop" onClick={busy ? undefined : onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={d.id ? "Editar item" : "Novo item"} style={{ width: "min(640px, 100%)" }}>
        <div className="sheet-h">
          <h2>{d.id ? "Editar item" : "Novo item"}</h2>
          <button className="x" onClick={onClose} disabled={busy} aria-label="Fechar">×</button>
        </div>
        <div className="sheet-b">
          <div className="field"><label htmlFor="f-name">Nome</label><input id="f-name" className="input" maxLength={80} value={d.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="field"><label htmlFor="f-desc">Descrição</label><textarea id="f-desc" className="input" rows={2} maxLength={300} value={d.description} onChange={(e) => set("description", e.target.value)} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field"><label htmlFor="f-price">Preço (R$)</label><input id="f-price" className="input" inputMode="decimal" placeholder="54,90" value={d.price} onChange={(e) => set("price", e.target.value)} /></div>
            <div className="field"><label htmlFor="f-sl">Texto do tamanho</label><input id="f-sl" className="input" maxLength={40} placeholder="Grande · 8 fatias" value={d.size_label} onChange={(e) => set("size_label", e.target.value)} /></div>
          </div>
          <div className="field">
            <label htmlFor="f-cat">Categoria</label>
            <select id="f-cat" className="input" value={d.category_id} onChange={(e) => set("category_id", e.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="f-ing">Ingredientes que o cliente pode tirar (separados por vírgula)</label><input id="f-ing" className="input" placeholder="Molho de tomate, Mussarela, Cebola" value={d.ingredients} onChange={(e) => set("ingredients", e.target.value)} /></div>
          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={d.available} onChange={(e) => set("available", e.target.checked)} /> Disponível no cardápio
          </label>

          <div className="sec">
            <h3>Tamanhos</h3>
            <p className="muted small" style={{ margin: "0 0 8px" }}>A diferença é somada ao preço base. Use negativo para tamanhos menores, ex.: -18,00.</p>
            {d.sizes.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px auto auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <input className="input" placeholder="Nome, ex.: Broto" aria-label="Nome do tamanho" value={s.label} maxLength={30} onChange={(e) => set("sizes", d.sizes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <input className="input" placeholder="Detalhe, ex.: 4 fatias" aria-label="Detalhe do tamanho" value={s.note} maxLength={40} onChange={(e) => set("sizes", d.sizes.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
                <input className="input" placeholder="0,00" aria-label="Diferença de preço" inputMode="decimal" value={s.delta} onChange={(e) => set("sizes", d.sizes.map((x, j) => (j === i ? { ...x, delta: e.target.value } : x)))} />
                <label className="small" title="Já vem marcado"><input type="radio" name="def" checked={s.is_default} onChange={() => set("sizes", d.sizes.map((x, j) => ({ ...x, is_default: j === i })))} /> padrão</label>
                <button className="btn ghost" aria-label="Remover tamanho" onClick={() => set("sizes", d.sizes.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button className="btn ghost" onClick={() => set("sizes", [...d.sizes, { label: "", note: "", delta: "0,00", is_default: d.sizes.length === 0 }])}>+ Tamanho</button>
          </div>

          <div className="sec">
            <h3>Adicionais</h3>
            {d.extras.map((x, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px auto", gap: 6, marginBottom: 6 }}>
                <input className="input" placeholder="Ex.: Borda de Catupiry" aria-label="Nome do adicional" value={x.name} maxLength={40} onChange={(e) => set("extras", d.extras.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                <input className="input" placeholder="9,00" aria-label="Preço do adicional" inputMode="decimal" value={x.price} onChange={(e) => set("extras", d.extras.map((y, j) => (j === i ? { ...y, price: e.target.value } : y)))} />
                <button className="btn ghost" aria-label="Remover adicional" onClick={() => set("extras", d.extras.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button className="btn ghost" onClick={() => set("extras", [...d.extras, { name: "", price: "" }])}>+ Adicional</button>
          </div>

          <div className="sec">
            <h3>Vídeo</h3>
            {d.video_url && !file && (
              <video src={d.video_url} poster={d.poster_url ?? undefined} muted loop playsInline controls style={{ width: 160, borderRadius: 10, display: "block", marginBottom: 8 }} />
            )}
            <p className="muted small" style={{ margin: "0 0 8px" }}>Vertical (9:16), de 5 a 15 segundos, até {MAX_VIDEO_MB} MB. A capa é criada sozinha a partir do vídeo.</p>
            <input type="file" accept="video/*" aria-label="Escolher vídeo" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            {file && <p className="small">Vídeo escolhido: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB). Ele será enviado ao salvar.</p>}
          </div>

          {err && <p className="err" role="alert">{err}</p>}
          {step && <p className="small" role="status">{step}</p>}
        </div>
        <div className="sheet-f">
          {d.id && !confirmDel && <button className="btn ghost" disabled={busy} onClick={() => setConfirmDel(true)}>Apagar</button>}
          {d.id && confirmDel && <button className="btn ghost" style={{ color: "var(--red)" }} disabled={busy} onClick={remove}>Confirmar: apagar item</button>}
          <button className="cta" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar"} <span /></button>
        </div>
      </div>
    </>
  );
}
