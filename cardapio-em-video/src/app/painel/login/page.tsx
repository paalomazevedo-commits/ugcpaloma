import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Entrar no painel", robots: { index: false } };

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword({ email, password });
  // Mensagem genérica de propósito: não revela se o e-mail existe.
  if (error) redirect("/painel/login?erro=1");
  redirect("/painel");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="auth">
      <h1 style={{ margin: 0 }}>Painel do restaurante</h1>
      <form action={signIn} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" required minLength={8} />
        </div>
        {erro && <p className="err" role="alert">E-mail ou senha incorretos.</p>}
        <button className="btn block" type="submit">Entrar</button>
      </form>
      <p className="muted small" style={{ margin: 0 }}>Esqueceu a senha? Fale com o suporte da plataforma.</p>
    </main>
  );
}
