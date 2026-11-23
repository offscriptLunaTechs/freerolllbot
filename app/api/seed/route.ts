import { withUser } from "@/lib/auth";
import { rpc } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Reveals the current server seed and starts a new one (provably fair rotation). */
export const POST = withUser(async (u, req) => {
  const body = await req.json().catch(() => ({}));
  return rpc("api_rotate_seed", { p_tg_id: u.id, p_client_seed: String(body?.client_seed ?? "") });
});
