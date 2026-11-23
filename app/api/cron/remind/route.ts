import { NextRequest, NextResponse } from "next/server";
import { rpc } from "@/lib/db";
import { botApi } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called every 5 minutes by pg_cron in Supabase. Tells players their free roll is ready again. */
export async function GET(req: NextRequest) {
  if (!process.env.API_SECRET || req.headers.get("x-cron-key") !== process.env.API_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const due = await rpc<{ tg_id: number; streak: number }[]>("api_due_reminders", {});
  let sent = 0;
  for (let i = 0; i < due.length; i += 25) {
    const batch = due.slice(i, i + 25);
    const results = await Promise.allSettled(
      batch.map((d) =>
        botApi("sendMessage", {
          chat_id: d.tg_id,
          text:
            d.streak > 0
              ? `🎲 Your free roll is ready! Keep your 🔥 ${d.streak}-day streak alive.`
              : "🎲 Your free roll is ready!",
          disable_notification: false,
          reply_markup: { inline_keyboard: [[{ text: "Roll now", web_app: { url: process.env.APP_URL } }]] },
        })
      )
    );
    sent += results.filter((r) => r.status === "fulfilled").length;
    if (i + 25 < due.length) await new Promise((r) => setTimeout(r, 1100)); // stay under Telegram's rate limit
  }
  return NextResponse.json({ ok: true, due: due.length, sent });
}
