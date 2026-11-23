import { NextRequest, NextResponse } from "next/server";
import { validateInitData, TgUser } from "./telegram";

/** Reads `Authorization: tma <initData>` and returns the verified Telegram user. */
export function authUser(req: NextRequest): TgUser | null {
  const header = req.headers.get("authorization") || "";
  const initData = header.startsWith("tma ") ? header.slice(4) : "";
  return validateInitData(initData, process.env.TELEGRAM_BOT_TOKEN || "");
}

export const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

export function withUser(handler: (user: TgUser, req: NextRequest) => Promise<unknown>) {
  return async (req: NextRequest) => {
    const user = authUser(req);
    if (!user) return unauthorized();
    try {
      return NextResponse.json(await handler(user, req));
    } catch (e) {
      console.error(e);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
  };
}
