import { withUser } from "@/lib/auth";
import { rpc } from "@/lib/db";

export const dynamic = "force-dynamic";

export const POST = withUser((u) =>
  rpc("api_upsert_player", {
    p_tg_id: u.id,
    p_username: u.username ?? null,
    p_first_name: u.first_name ?? null,
    p_photo_url: u.photo_url ?? null,
  })
);
