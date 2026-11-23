import { withUser } from "@/lib/auth";
import { rpc } from "@/lib/db";
import { botApi } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["reset_cooldown", "skip_cooldown", "add_bonus_rolls", "add_points", "set_streak", "cooldown_ready_soon", "test_reminder"]);

/** Admin test tools. The database re-checks that the caller is an admin for every action. */
export const POST = withUser(async (u, req) => {
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const value = Number.isFinite(Number(body?.value)) ? Math.trunc(Number(body.value)) : 0;
  if (!ACTIONS.has(action)) return { error: "unknown_action" };

  if (action === "test_reminder") {
    // Admin check via a no-op action, then send the reminder message straight away.
    const state = await rpc("api_admin", { p_tg_id: u.id, p_action: "reset_cooldown", p_value: 0 });
    await botApi("sendMessage", {
      chat_id: u.id,
      text: `🎲 Your free roll is ready!${state.streak_days > 0 ? ` Keep your 🔥 ${state.streak_days}-day streak alive.` : ""}\n\n(test reminder)`,
      reply_markup: { inline_keyboard: [[{ text: "Roll now", web_app: { url: process.env.APP_URL } }]] },
    });
    return state;
  }
  return rpc("api_admin", { p_tg_id: u.id, p_action: action, p_value: value });
});
