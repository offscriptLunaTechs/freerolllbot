import crypto from "node:crypto";

export type TgUser = {
  id: number;
  username?: string;
  first_name?: string;
  photo_url?: string;
  /** startapp parameter from the launch link, if any (validated as part of initData). */
  start_param?: string;
};

/** Parses "ref_123" into 123. */
export function refFrom(param?: string | null): number | null {
  const m = /^ref_(\d{1,15})$/.exec(param || "");
  return m ? Number(m[1]) : null;
}

const MAX_AGE_SECONDS = 24 * 60 * 60;

/** Validates Telegram WebApp initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). */
export function validateInitData(initData: string, botToken: string): TgUser | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;
  try {
    const user = JSON.parse(params.get("user") || "null");
    if (!user || typeof user.id !== "number") return null;
    return { ...user, start_param: params.get("start_param") || undefined };
  } catch {
    return null;
  }
}

export async function botApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description}`);
  return json.result as T;
}
