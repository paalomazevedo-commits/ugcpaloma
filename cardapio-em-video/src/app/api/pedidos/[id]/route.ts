import { NextResponse } from "next/server";
import { getPublicOrder } from "@/lib/orders";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const order = await getPublicOrder(id, token);
  if (!order) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  return NextResponse.json({ status: order.status }, { headers: { "Cache-Control": "no-store" } });
}
