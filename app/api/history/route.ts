import { withUser } from "@/lib/auth";
import { rpc } from "@/lib/db";

export const dynamic = "force-dynamic";

export const POST = withUser((u) => rpc("api_history", { p_tg_id: u.id }));
