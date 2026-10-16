import Link from "next/link";

export default function Home() {
  return (
    <main className="auth" style={{ maxWidth: 560 }}>
      <h1 style={{ margin: 0, fontSize: 30, letterSpacing: "-.02em" }}>Cardápio em Vídeo</h1>
      <p className="muted" style={{ margin: 0 }}>
        O cardápio do seu restaurante no formato de rede social: cada prato em vídeo, pedido direto pelo celular,
        sem comissão por pedido.
      </p>
      <p style={{ margin: 0 }}>
        <Link className="btn" href="/forno-nero">Ver um cardápio de exemplo</Link>
      </p>
      <p className="small muted" style={{ margin: 0 }}>
        Já é cliente? <Link href="/painel">Entrar no painel do restaurante</Link>
      </p>
    </main>
  );
}
