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
      menu_button: { type: "web_app", text: "Play", web_app: { url: appUrl } },
    });
    results.commands = await botApi("setMyCommands", {
      commands: [
        { command: "start", description: "Open Free Roll" },
        { command: "paysupport", description: "Help with a Stars purchase" },
      ],
    });
    results.bot = await botApi("getMe", {});
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), results }, { status: 500 });
  }
}
