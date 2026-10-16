import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import CreateRestaurantForm from "@/components/CreateRestaurantForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin da plataforma", robots: { index: false } };

async function setStatus(formData: FormData) {
  "use server";
  await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status") === "suspended" ? "suspended" : "active";
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect("/admin");
  await supabaseAdmin().from("restaurants").update({ status }).eq("id", id);
  redirect("/admin");
}

export default async function Admin() {
  await requirePlatformAdmin();
  const { data: restaurants } = await supabaseAdmin()
    .from("restaurants")
    .select("id, name, slug, city, status, is_open, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="wide">
      <div className="panel-top">
        <h1>Admin da plataforma</h1>
        <span style={{ flex: 1 }} />
        <Link className="small" href="/painel">Painel</Link>
      </div>

      <CreateRestaurantForm />

      <div className="tablewrap">
        <table>
          <thead><tr><th>Restaurante</th><th>Endereço</th><th>Cidade</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            {(restaurants ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td><Link href={`/${r.slug}`} target="_blank">/{r.slug}</Link></td>
                <td>{r.city}</td>
                <td>{r.status === "active" ? "Ativo" : "Suspenso"}</td>
                <td>
                  <form action={setStatus}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value={r.status === "active" ? "suspended" : "active"} />
                    <button className="small" style={{ textDecoration: "underline" }}>{r.status === "active" ? "Suspender" : "Reativar"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
