"use client";

import { useActionState } from "react";
import { createRestaurant, type CreateState } from "@/app/admin/actions";

export default function CreateRestaurantForm() {
  const [state, action, pending] = useActionState<CreateState, FormData>(createRestaurant, null);
  return (
    <section className="card" style={{ marginBottom: 24 }}>
      <h2 style={{ margin: 0, fontSize: 17 }}>Cadastrar restaurante</h2>
      {state?.slug && (
        <div className="card" role="status">
          <b>Restaurante criado: /{state.slug}</b>
          {state.tempPassword ? (
            <span>
              Senha provisória do dono: <code style={{ userSelect: "all" }}>{state.tempPassword}</code>. Envie por um
              canal seguro e peça para ele trocar no primeiro acesso. Ela não aparece de novo.
            </span>
          ) : (
            <span>O e-mail já tinha conta. Ela foi ligada ao restaurante como dona.</span>
          )}
        </div>
      )}
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <form action={action} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div className="field"><label htmlFor="name">Nome</label><input id="name" name="name" className="input" required maxLength={80} /></div>
        <div className="field"><label htmlFor="slug">Endereço do cardápio</label><input id="slug" name="slug" className="input" required placeholder="ex.: pizzaria-do-ze" pattern="[a-z0-9-]{3,40}" /></div>
        <div className="field"><label htmlFor="city">Cidade</label><input id="city" name="city" className="input" maxLength={80} /></div>
        <div className="field"><label htmlFor="email">E-mail do dono</label><input id="email" name="email" type="email" className="input" required /></div>
        <div style={{ alignSelf: "end" }}><button className="btn block" type="submit" disabled={pending}>{pending ? "Cadastrando…" : "Cadastrar"}</button></div>
      </form>
    </section>
  );
}
