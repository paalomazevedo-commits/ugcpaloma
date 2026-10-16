import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Trocar senha", robots: { index: false } };

async function change(formData: FormData) {
  "use server";
  const { db } = await requireUser();
  const pw = String(formData.get("password") ?? "");
  const again = String(formData.get("again") ?? "");
  if (pw.length < 12 || pw !== again) redirect("/painel/senha?erro=1");
  const { error } = await db.auth.updateUser({ password: pw });
  redirect(error ? "/painel/senha?erro=2" : "/painel?senha=ok");
}

export default async function Senha({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  await requireUser();
  const { erro } = await searchParams;
  return (
    <main className="auth">
      <h1 style={{ margin: 0 }}>Trocar senha</h1>
      <form action={change} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="field">
          <label htmlFor="password">Nova senha (mínimo 12 caracteres)</label>
          <input id="password" name="password" type="password" className="input" autoComplete="new-password" required minLength={12} />
        </div>
        <div className="field">
          <label htmlFor="again">Repita a nova senha</label>
          <input id="again" name="again" type="password" className="input" autoComplete="new-password" required minLength={12} />
        </div>
        {erro === "1" && <p className="err" role="alert">As senhas precisam ser iguais e ter pelo menos 12 caracteres.</p>}
        {erro === "2" && <p className="err" role="alert">Não foi possível trocar a senha. Tente outra.</p>}
        <button className="btn block" type="submit">Salvar nova senha</button>
      </form>
    </main>
  );
}
