import { withUser } from "@/lib/auth";
import { botApi } from "@/lib/telegram";
import { PRODUCTS, ProductId } from "@/lib/products";

export const dynamic = "force-dynamic";

/** Creates a Telegram Stars (XTR) invoice link that the mini app opens with WebApp.openInvoice. */
export const POST = withUser(async (u, req) => {
  const body = await req.json().catch(() => ({}));
  const id = body?.product as ProductId;
  const p = PRODUCTS[id];
  if (!p) return { error: "unknown_product" };
  const link = await botApi<string>("createInvoiceLink", {
    title: p.title,
    description: p.description,
    payload: `${id}:${u.id}`,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: p.title, amount: p.stars }],
  });
  return { link };
});
