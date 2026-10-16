import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

export const orderLineSchema = z.object({
  itemId: z.string().uuid(),
  sizeId: z.string().uuid().nullable(),
  extraIds: z.array(z.string().uuid()).max(10),
  removed: z.array(text(40)).max(20),
  notes: text(140),
  qty: z.number().int().min(1).max(20),
});

export const orderSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
    mode: z.enum(["entrega", "retirada", "mesa"]),
    name: text(80).min(2, "Informe seu nome."),
    phone: z.string().transform((v) => v.replace(/\D/g, "")).pipe(
      z.string().regex(/^[0-9]{10,11}$/, "Informe um WhatsApp com DDD."),
    ),
    address: text(200),
    table: text(10),
    payment: z.enum(["pix", "cartao", "dinheiro"]),
    changeFor: z.number().int().min(0).max(1000000).nullable(),
    lines: z.array(orderLineSchema).min(1).max(30),
    // Campo-isca: fica escondido na tela; se vier preenchido, foi um robô.
    website: z.string().max(0).optional().or(z.literal("")),
  })
  .superRefine((o, ctx) => {
    if (o.mode === "entrega" && o.address.length < 8)
      ctx.addIssue({ code: "custom", path: ["address"], message: "Informe o endereço de entrega." });
    if (o.mode === "mesa" && o.table.length < 1)
      ctx.addIssue({ code: "custom", path: ["table"], message: "Informe o número da mesa." });
  });

export type OrderInput = z.infer<typeof orderSchema>;
