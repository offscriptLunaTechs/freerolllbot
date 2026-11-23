/** Calls a Supabase RPC. Every api_* function checks API_SECRET inside Postgres. */
export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars are not set");
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ p_secret: process.env.API_SECRET, ...args }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`rpc ${fn} failed: ${res.status} ${await res.text()}`);
  return res.json();
}
