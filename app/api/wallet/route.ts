import { withUser } from "@/lib/auth";
import { rpc } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Stores the TON wallet address linked through TON Connect (display only for now). */
export const POST = withUser(async (u, req) => {
  const body = await req.json().catch(() => ({}));
  const address = typeof body?.address === "string" ? body.address : "";
  return rpc("api_set_wallet", { p_tg_id: u.id, p_address: address });
});
