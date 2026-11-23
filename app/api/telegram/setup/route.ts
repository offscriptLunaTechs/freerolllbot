import { NextRequest, NextResponse } from "next/server";
import { botApi } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * One-time bot setup. Open /api/telegram/setup?key=<API_SECRET> after setting the env vars.
 * Registers the webhook, the menu button, and the bot commands.
 */
export async function GET(req: NextRequest) {
  if (!process.env.API_SECRET || req.nextUrl.searchParams.get("key") !== process.env.API_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const appUrl = process.env.APP_URL || req.nextUrl.origin;
  const results: Record<string, unknown> = {};
  try {
    results.webhook = await botApi("setWebhook", {
      url: `${appUrl}/api/telegram/webhook`,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "pre_checkout_query"],
      drop_pending_updates: true,
    });
    results.menu = await botApi("setChatMenuButton", {
      menu_button: { type: "web_app", text: "🎲 Play", web_app: { url: appUrl } },
    });
    results.commands = await botApi("setMyCommands", {
      commands: [
        { command: "start", description: "Open Free Roll" },
        { command: "paysupport", description: "Help with a Stars purchase" },
      ],
    });
    // Profile texts. Telegram rate-limits setMyName, so a failure there should not stop the rest.
    results.name = await botApi("setMyName", { name: "Free Roll 🎲" }).catch((e) => String(e));
    results.short_description = await botApi("setMyShortDescription", {
      short_description: "🎲 One free roll every hour. Win up to 10,000 points, build your daily streak and top the weekly leaderboard.",
    });
    results.description = await botApi("setMyDescription", {
      description:
        "🎲 Free Roll: roll a number from 0000 to 9999 for free, every hour.\n\n" +
        "⭐ Win up to 10,000 points per roll\n" +
        "🔥 Daily streaks multiply your prizes up to x2\n" +
        "🏆 Weekly and all-time leaderboards\n" +
        "👥 Invite friends and earn 10% of their wins\n" +
        "🔐 Provably fair: verify every roll yourself\n\n" +
        "Points are for fun and have no cash value. Tap Start to play.",
    });
    results.bot = await botApi("getMe", {});
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), results }, { status: 500 });
  }
}
