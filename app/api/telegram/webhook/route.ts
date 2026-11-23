import { NextRequest, NextResponse } from "next/server";
import { botApi, refFrom } from "@/lib/telegram";
import { rpc } from "@/lib/db";
import { PRODUCTS, ProductId } from "@/lib/products";

export const dynamic = "force-dynamic";

function parsePayload(payload: string) {
  const [id, tg] = String(payload || "").split(":");
  const product = PRODUCTS[id as ProductId];
  return product ? { id: id as ProductId, product, tgId: Number(tg) } : null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json();

  try {
    // 1) Stars checkout: Telegram asks us to confirm within 10 seconds.
    if (update.pre_checkout_query) {
      const q = update.pre_checkout_query;
      const parsed = parsePayload(q.invoice_payload);
      const ok = !!parsed && q.currency === "XTR" && q.total_amount === parsed.product.stars && parsed.tgId === q.from.id;
      await botApi("answerPreCheckoutQuery", {
        pre_checkout_query_id: q.id,
        ok,
        ...(ok ? {} : { error_message: "This offer is no longer available." }),
      });
    }

    const msg = update.message;
    // 2) Payment done: credit bonus rolls (idempotent on the charge id).
    if (msg?.successful_payment) {
      const sp = msg.successful_payment;
      const parsed = parsePayload(sp.invoice_payload);
      if (parsed && sp.currency === "XTR" && sp.total_amount === parsed.product.stars) {
        await rpc("api_credit_payment", {
          p_charge_id: sp.telegram_payment_charge_id,
          p_tg_id: msg.from.id,
          p_product: parsed.id,
          p_stars: sp.total_amount,
          p_rolls: parsed.product.rolls,
        });
        await botApi("sendMessage", {
          chat_id: msg.chat.id,
          text: `Thanks! ${parsed.product.rolls} bonus rolls were added. Open the app to use them.`,
        });
      }
    } else if (typeof msg?.text === "string" && msg.text.startsWith("/start")) {
      // 3) /start [ref_123]: register the player (and their inviter), then show the Play button.
      const ref = refFrom(msg.text.split(" ")[1]);
      const st = await rpc("api_upsert_player", {
        p_tg_id: msg.from.id,
        p_username: msg.from.username ?? null,
        p_first_name: msg.from.first_name ?? null,
        p_photo_url: null,
        p_ref: ref,
      });
      const welcome = st?.welcome_bonus ? "\n\n🎁 You were invited by a friend: +50 bonus points are waiting for you." : "";
      await botApi("sendMessage", {
        chat_id: msg.chat.id,
        text:
          "🎲 Free Roll\n\nOne free roll every hour. Roll 0000–9999 and win up to 10,000 points.\n" +
          "🔥 Roll every day to grow your streak multiplier (up to x2).\n" +
          "👥 Invite friends and earn 10% of everything they win." + welcome,
        reply_markup: {
          inline_keyboard: [[{ text: "🎲 Play now", web_app: { url: process.env.APP_URL } }]],
        },
      });
    } else if (typeof msg?.text === "string" && msg.text.startsWith("/paysupport")) {
      await botApi("sendMessage", {
        chat_id: msg.chat.id,
        text: "For help with a Stars purchase, reply here with what went wrong and we will get back to you.",
      });
    }
  } catch (e) {
    console.error(e);
  }
  return NextResponse.json({ ok: true });
}
