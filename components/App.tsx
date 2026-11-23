"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TonConnectButton, TonConnectUIProvider, useTonAddress } from "@tonconnect/ui-react";

type State = {
  tg_id: number;
  points: number;
  bonus_rolls: number;
  total_rolls: number;
  next_free_roll_at: string | null;
  server_seed_hash: string;
  client_seed: string;
  nonce: number;
  wallet_address: string | null;
  streak_days: number;
  streak_today: boolean;
  best_streak: number;
  multiplier: number;
  referrals: number;
  ref_earnings: number;
  ref_percent: number;
  week_points: number;
  server_time: string;
  welcome_bonus?: boolean;
  is_admin?: boolean;
  skip_cooldown?: boolean;
};
type RollRow = { id: number; kind: string; roll: number; prize: number; server_seed_hash: string; client_seed: string; nonce: number; created_at: string };
type Revealed = { id?: number; server_seed: string; server_seed_hash: string; client_seed: string; last_nonce: number };
type Tab = "roll" | "top" | "invite" | "shop" | "fair" | "admin";

const BOT = process.env.NEXT_PUBLIC_BOT_USERNAME || "Freeroll1bot";

const PRIZES = [
  { range: "0000 – 8999", prize: 5 },
  { range: "9000 – 9899", prize: 25 },
  { range: "9900 – 9989", prize: 100 },
  { range: "9990 – 9998", prize: 1000 },
  { range: "9999", prize: 10000 },
];

const TITLES = ["Rookie", "Roller", "Lucky", "Hot Hand", "High Roller", "Shark", "Legend", "Mythic"];
/** Level n needs 25·(n-1)² points: 1 → 0, 2 → 25, 3 → 100, 5 → 400, 10 → 2025 … */
function levelOf(points: number) {
  const level = Math.floor(Math.sqrt(points / 25)) + 1;
  const cur = 25 * (level - 1) ** 2;
  const next = 25 * level ** 2;
  const title = TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 3))];
  return { level, title, progress: (points - cur) / (next - cur), toNext: next - points };
}

declare global {
  interface Window { Telegram?: any }
}
const tg = () => (typeof window !== "undefined" ? window.Telegram?.WebApp : undefined);
const haptic = (kind: "light" | "medium" | "heavy" | "success" | "warning" | "select") => {
  const h = tg()?.HapticFeedback;
  if (!h) return;
  if (kind === "select") h.selectionChanged();
  else if (kind === "success" || kind === "warning") h.notificationOccurred(kind);
  else h.impactOccurred(kind);
};

async function api<T = any>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `tma ${tg()?.initData ?? ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

async function hmacRoll(serverSeed: string, clientSeed: string, nonce: number) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(serverSeed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${clientSeed}:${nonce}`)));
  const n = ((sig[0] << 24) >>> 0) + (sig[1] << 16) + (sig[2] << 8) + sig[3];
  return Math.floor((n / 4294967296) * 10000);
}
async function sha256Hex(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
const inviteLink = (id: number) => `https://t.me/${BOT}?start=ref_${id}`;

export default function AppRoot() {
  return (
    <TonConnectUIProvider manifestUrl={`${window.location.origin}/tonconnect-manifest.json`}>
      <Game />
    </TonConnectUIProvider>
  );
}

function Game() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("roll");
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const offset = useRef(0);

  const apply = useCallback((s: State) => {
    offset.current = new Date(s.server_time).getTime() - Date.now();
    setState(s);
  }, []);

  useEffect(() => {
    const w = tg();
    w?.ready();
    w?.expand();
    w?.setHeaderColor?.("secondary_bg_color");
    if (!w?.initData) {
      setError("Open this app from the Telegram bot to play.");
      return;
    }
    api<State>("/api/me")
      .then((s) => {
        apply(s);
        if (s.welcome_bonus) setToast("🎁 Welcome! Your friend's invite gave you +50 points.");
        // Ask once so the bot can remind you when your free roll is ready.
        try { w.requestWriteAccess?.(); } catch {}
      })
      .catch((e) => setError(String(e.message || e)));
  }, [apply]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (error) return <div className="card"><h2>🎲 Free Roll</h2><p className="hint">{error}</p></div>;
  if (!state) return <div className="card"><p className="hint">Loading…</p></div>;

  const waitMs = Math.max(0, (state.next_free_roll_at ? new Date(state.next_free_roll_at).getTime() : 0) - (now + offset.current));
  const lv = levelOf(state.points);

  return (
    <>
      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}

      <div className="card header">
        <div className="row">
          <div>
            <div className="hint">Points</div>
            <div className="stat">⭐ {state.points.toLocaleString()}</div>
          </div>
          <div className="streak" title="Daily streak">
            <span className={state.streak_days > 0 ? "flame on" : "flame"}>🔥</span>
            <b>{state.streak_days}</b>
            <span className="pill">x{Number(state.multiplier).toFixed(1)}</span>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="hint">Lv {lv.level} · {lv.title}</span>
          <span className="hint">{lv.toNext.toLocaleString()} to Lv {lv.level + 1}</span>
        </div>
        <div className="bar"><div style={{ width: `${Math.max(3, lv.progress * 100)}%` }} /></div>
      </div>

      {tab === "roll" && <RollTab state={state} apply={apply} waitMs={waitMs} />}
      {tab === "top" && <TopTab />}
      {tab === "invite" && <InviteTab state={state} />}
      {tab === "shop" && <ShopTab state={state} apply={apply} />}
      {tab === "fair" && <FairTab state={state} apply={apply} />}
      {tab === "admin" && state.is_admin && <AdminTab state={state} apply={apply} />}

      <nav className="tabs">
        {([["roll", "🎲", "Roll"], ["top", "🏆", "Top"], ["invite", "👥", "Invite"], ["shop", "✨", "Shop"], ["fair", "🔐", "Fair"],
           ...(state.is_admin ? [["admin", "🛠", "Admin"]] : [])] as [Tab, string, string][]).map(([id, ico, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => { haptic("select"); setTab(id); }}>
            <span className="ico">{ico}</span>{label}
          </button>
        ))}
      </nav>
    </>
  );
}

/** Four slot-machine reels that stop one by one, left to right. */
function Reels({ value, spinning, win }: { value: number | null; spinning: boolean; win: boolean }) {
  const [digits, setDigits] = useState<string[]>(["?", "?", "?", "?"]);
  const [locked, setLocked] = useState(4);

  useEffect(() => {
    if (spinning) setLocked(0);
  }, [spinning]);

  useEffect(() => {
    if (!spinning && (value === null || locked >= 4)) return;
    const target = value === null ? null : String(value).padStart(4, "0");
    const t = setInterval(() => {
      setDigits((d) => d.map((cur, i) => (target && i < locked ? target[i] : String(Math.floor(Math.random() * 10)))));
    }, 55);
    return () => clearInterval(t);
  }, [spinning, value, locked]);

  // Once the result is known, lock one reel every 280 ms.
  useEffect(() => {
    if (value === null || locked >= 4) return;
    const t = setTimeout(() => {
      setLocked((l) => l + 1);
      haptic(locked === 3 ? "heavy" : "light");
    }, locked === 0 ? 150 : 280);
    return () => clearTimeout(t);
  }, [value, locked]);

  useEffect(() => {
    if (value !== null && locked >= 4) setDigits(String(value).padStart(4, "0").split(""));
  }, [value, locked]);

  return (
    <div className={`reels ${win && locked >= 4 ? "win" : ""}`}>
      {digits.map((d, i) => (
        <div key={i} className={`reel ${i < locked || (!spinning && value === null) ? "" : "spin"}`}>{d}</div>
      ))}
    </div>
  );
}

function RollTab({ state, apply, waitMs }: { state: State; apply: (s: State) => void; waitMs: number }) {
  const [value, setValue] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<{ roll: number; prize: number; base: number; mult: number; kind: string; streak: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const free = waitMs <= 0;
  const canRoll = !spinning && (free || state.bonus_rolls > 0);

  async function roll() {
    haptic("medium");
    setSpinning(true);
    setValue(null);
    setLast(null);
    setRevealed(false);
    try {
      const [res] = await Promise.all([api("/api/roll"), new Promise((r) => setTimeout(r, 700))]);
      if (res.error === "cooldown") {
        apply(res.state);
        setSpinning(false);
        return;
      }
      setValue(res.roll);
      setSpinning(false);
      // Reveal the prize after the reels finish (4 × 280 ms).
      setTimeout(() => {
        setLast({ roll: res.roll, prize: res.prize, base: res.base_prize, mult: Number(res.multiplier), kind: res.kind, streak: res.streak_days });
        setRevealed(true);
        apply(res.state);
        haptic(res.base_prize >= 100 ? "success" : "warning");
      }, 1150);
    } catch (e: any) {
      setSpinning(false);
      tg()?.showAlert?.(`Roll failed: ${e.message}`);
    }
  }

  function shareStory() {
    if (!last) return;
    const url = `${window.location.origin}/api/story?roll=${last.roll}&prize=${last.prize}&streak=${last.streak}`;
    const text = `I rolled ${String(last.roll).padStart(4, "0")} and won ${last.prize} points on Free Roll 🎲`;
    const w = tg();
    if (w?.shareToStory) {
      w.shareToStory(url, { text, widget_link: { url: inviteLink(state.tg_id), name: "Play Free Roll" } });
    } else {
      w?.openTelegramLink?.(`https://t.me/share/url?url=${encodeURIComponent(inviteLink(state.tg_id))}&text=${encodeURIComponent(text)}`);
    }
  }

  const big = !!last && last.base >= 100;
  return (
    <>
      <div className={`card roll-card ${big && revealed ? "jackpot" : ""}`}>
        <Reels value={value} spinning={spinning} win={big} />
        <p className="result" style={{ minHeight: 26 }}>
          {revealed && last ? (
            <>
              <b className={big ? "gold" : ""}>+{last.prize.toLocaleString()} points</b>
              {last.mult > 1 && <span className="hint"> ({last.base} × {last.mult.toFixed(1)} streak)</span>}
              {last.kind === "bonus" && <span className="hint"> · bonus roll</span>}
            </>
          ) : spinning ? <span className="hint">Rolling…</span> : <span className="hint">Roll a number from 0000 to 9999</span>}
        </p>
        <button className="btn" disabled={!canRoll} onClick={roll}>
          {spinning ? "Rolling…" : free ? "🎲 Free roll" : state.bonus_rolls > 0 ? `Use bonus roll (${state.bonus_rolls})` : `Next free roll in ${fmt(waitMs)}`}
        </button>
        {!free && state.bonus_rolls > 0 && <p className="hint center">Free roll in {fmt(waitMs)}</p>}
        {state.skip_cooldown && <p className="hint center">🛠 Admin: cooldown is off</p>}
        {revealed && last && (
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={shareStory}>📣 Share to story</button>
        )}
      </div>

      <div className="card">
        <div className="row">
          <h3 style={{ margin: 0 }}>🔥 Daily streak</h3>
          <span className="pill">best {state.best_streak}</span>
        </div>
        <p className="hint">
          Roll at least once a day to keep your streak. Each day adds +0.1 to your multiplier, up to x2.0 at 11 days.
          {state.streak_today ? " Today is done ✅" : state.streak_days > 0 ? " Roll today to keep it!" : ""}
        </p>
        <div className="days">
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} className={i < state.streak_days ? "day on" : "day"}>{i + 1}</div>
          ))}
        </div>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Roll</th><th style={{ textAlign: "right" }}>Prize</th></tr></thead>
          <tbody>
            {PRIZES.map((p) => (
              <tr key={p.range}><td>{p.range}</td><td style={{ textAlign: "right" }}>⭐ {p.prize.toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Prizes are multiplied by your streak. Points are for fun and the leaderboard. They have no cash value and cannot be withdrawn.</p>
      </div>
    </>
  );
}

type Row = { name: string; points: number; total_rolls: number; me: boolean };
function TopTab() {
  const [data, setData] = useState<{ all: Row[]; week: Row[]; my_rank: number; week_ends_at: string } | null>(null);
  const [view, setView] = useState<"week" | "all">("week");
  useEffect(() => { api("/api/leaderboard").then(setData).catch(() => setData({ all: [], week: [], my_rank: 0, week_ends_at: "" })); }, []);
  if (!data) return <div className="card hint">Loading…</div>;
  const rows = view === "week" ? data.week : data.all;
  const left = data.week_ends_at ? new Date(data.week_ends_at).getTime() - Date.now() : 0;
  const days = Math.floor(left / 86400000);
  return (
    <div className="card">
      <div className="seg">
        <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>This week</button>
        <button className={view === "all" ? "on" : ""} onClick={() => setView("all")}>All time</button>
      </div>
      <p className="hint center">
        {view === "week" ? `Season resets in ${days}d ${Math.floor((left % 86400000) / 3600000)}h (Monday 00:00 UTC)` : data.my_rank > 0 ? `Your rank: #${data.my_rank}` : ""}
      </p>
      {rows.length === 0 ? <p className="hint center">No rolls yet. Be the first!</p> : (
        <table>
          <thead><tr><th>#</th><th>Player</th><th style={{ textAlign: "right" }}>Points</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.me ? "me" : ""}>
                <td>{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                <td>{r.name}{r.me ? " (you)" : ""}</td>
                <td style={{ textAlign: "right" }}>{Number(r.points).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function InviteTab({ state }: { state: State }) {
  const link = inviteLink(state.tg_id);
  const [copied, setCopied] = useState(false);
  const text = "🎲 Free roll every hour. Win points, build your streak and climb the leaderboard. Join me:";
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Invite friends</h3>
        <p className="hint">
          You get <b>{state.ref_percent}%</b> of every point your friends win, forever. Each friend also starts with +50 points.
        </p>
        <div className="row stats3">
          <div><div className="stat">{state.referrals}</div><div className="hint">friends</div></div>
          <div><div className="stat">⭐ {Number(state.ref_earnings).toLocaleString()}</div><div className="hint">earned</div></div>
        </div>
        <button className="btn" style={{ marginTop: 12 }}
          onClick={() => { haptic("light"); tg()?.openTelegramLink?.(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`); }}>
          👥 Invite friends
        </button>
        <button className="btn ghost" style={{ marginTop: 8 }}
          onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); haptic("success"); } catch { tg()?.showAlert?.(link); } }}>
          {copied ? "✅ Link copied" : "Copy invite link"}
        </button>
        <p className="mono" style={{ marginTop: 8 }}>{link}</p>
      </div>
    </>
  );
}

function FairTab({ state, apply }: { state: State; apply: (s: State) => void }) {
  const [hist, setHist] = useState<{ rolls: RollRow[]; revealed: Revealed[] } | null>(null);
  const [seed, setSeed] = useState("");
  const [checks, setChecks] = useState<Record<number, string>>({});

  const load = useCallback(() => api("/api/history").then(setHist).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  async function rotate() {
    const res = await api("/api/seed", { client_seed: seed });
    apply(res.state);
    setSeed("");
    await load();
  }

  async function verify(r: RollRow) {
    const rev = hist?.revealed.find((s) => s.server_seed_hash === r.server_seed_hash);
    if (!rev) return setChecks((c) => ({ ...c, [r.id]: "Rotate your seed first to reveal it." }));
    const hashOk = (await sha256Hex(rev.server_seed)) === r.server_seed_hash;
    const value = await hmacRoll(rev.server_seed, r.client_seed, r.nonce);
    setChecks((c) => ({ ...c, [r.id]: hashOk && value === r.roll ? `✅ ${value}` : `❌ got ${value}` }));
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Provably fair</h3>
        <p className="hint">
          Each roll is HMAC-SHA256(server seed, &quot;client seed:nonce&quot;). The first 4 bytes, scaled to 0–9999, are your roll.
          You see the hash of the server seed before you roll. Rotate the seed to reveal it and check past rolls.
        </p>
        <div className="hint">Server seed hash</div>
        <div className="mono">{state.server_seed_hash}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <div><div className="hint">Client seed</div><div className="mono">{state.client_seed}</div></div>
          <div style={{ textAlign: "right" }}><div className="hint">Next nonce</div><div>{state.nonce}</div></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <input placeholder="New client seed (optional)" value={seed} onChange={(e) => setSeed(e.target.value)} />
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={rotate}>Reveal and rotate server seed</button>
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent rolls</h3>
        {!hist ? <p className="hint">Loading…</p> : hist.rolls.length === 0 ? <p className="hint">No rolls yet.</p> : (
          <table>
            <thead><tr><th>Roll</th><th>Prize</th><th>Nonce</th><th></th></tr></thead>
            <tbody>
              {hist.rolls.map((r) => (
                <tr key={r.id}>
                  <td>{String(r.roll).padStart(4, "0")}</td>
                  <td>{r.prize}</td>
                  <td>{r.nonce}</td>
                  <td style={{ textAlign: "right" }}>
                    {checks[r.id] ? <span className="hint">{checks[r.id]}</span> : <button className="pill" onClick={() => verify(r)}>Verify</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function ShopTab({ state, apply }: { state: State; apply: (s: State) => void }) {
  const address = useTonAddress();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // Only save once a wallet is connected, so a slow session restore never clears it.
    if (address && address !== state.wallet_address) {
      api<State>("/api/wallet", { address }).then(apply).catch(() => {});
    }
  }, [address, state.wallet_address, apply]);

  async function buy(product: string) {
    setBusy(product);
    try {
      const { link, error } = await api("/api/stars/invoice", { product });
      if (!link) throw new Error(error || "no_link");
      tg()?.openInvoice(link, async (status: string) => {
        if (status === "paid") {
          haptic("success");
          for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            const s = await api<State>("/api/me");
            apply(s);
            if (s.bonus_rolls > state.bonus_rolls) break;
          }
        }
        setBusy(null);
      });
    } catch (e: any) {
      tg()?.showAlert?.(`Could not start the payment: ${e.message}`);
      setBusy(null);
    }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Bonus rolls</h3>
        <p className="hint">Skip the wait. Bonus rolls are used when your free roll is on cooldown, and count for your streak multiplier.</p>
        {[["rolls5", "5 bonus rolls", 25], ["rolls20", "20 bonus rolls", 75]].map(([id, label, stars]) => (
          <div className="row" key={id as string} style={{ marginTop: 10 }}>
            <div>{label}</div>
            <button className="btn" style={{ width: "auto", padding: "10px 16px" }} disabled={!!busy} onClick={() => buy(id as string)}>
              {busy === id ? "…" : `⭐ ${stars} Stars`}
            </button>
          </div>
        ))}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>TON wallet <span className="pill">beta</span></h3>
        <p className="hint">Link a TON wallet to your profile. On-chain rewards are not live yet.</p>
        <TonConnectButton />
        {state.wallet_address && <p className="mono" style={{ marginTop: 8 }}>{state.wallet_address}</p>}
      </div>
    </>
  );
}

function AdminTab({ state, apply }: { state: State; apply: (s: State) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [streak, setStreak] = useState(String(Math.max(state.streak_days, 5)));

  async function run(action: string, value = 0, label = "Done") {
    setBusy(action);
    setMsg(null);
    try {
      const s = await api<State>("/api/admin", { action, value });
      apply(s);
      setMsg(`✅ ${label}`);
      haptic("success");
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(null);
    }
  }
  const B = ({ a, v = 0, label, done, ghost }: { a: string; v?: number; label: string; done?: string; ghost?: boolean }) => (
    <button className={`btn ${ghost ? "ghost" : ""}`} style={{ marginTop: 8 }} disabled={!!busy} onClick={() => run(a, v, done || label)}>
      {busy === a ? "…" : label}
    </button>
  );

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🛠 Admin test tools</h3>
        <p className="hint">Only visible to admins. Every action is checked on the server.</p>
        {msg && <p className="center">{msg}</p>}

        <div className="row" style={{ marginTop: 8 }}>
          <div>
            <b>Skip cooldown</b>
            <div className="hint">Roll as often as you like</div>
          </div>
          <button className={`btn ${state.skip_cooldown ? "" : "ghost"}`} style={{ width: "auto", padding: "8px 16px" }} disabled={!!busy}
            onClick={() => run("skip_cooldown", state.skip_cooldown ? 0 : 1, state.skip_cooldown ? "Cooldown is back on" : "Cooldown is off")}>
            {state.skip_cooldown ? "On" : "Off"}
          </button>
        </div>
        <B a="reset_cooldown" label="Reset free roll cooldown" done="Free roll is ready" ghost />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Balances</h3>
        <div className="grid2">
          <B a="add_bonus_rolls" v={10} label="+10 bonus rolls" />
          <B a="add_points" v={1000} label="+1,000 points" />
          <B a="add_points" v={10000} label="+10,000 points" ghost />
          <B a="add_points" v={-1000} label="−1,000 points" ghost />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Streak</h3>
        <p className="hint">Sets your streak as of yesterday, so your next roll counts as the next day.</p>
        <div className="row">
          <input type="number" min={0} max={365} value={streak} onChange={(e) => setStreak(e.target.value)} />
          <button className="btn" style={{ width: "auto", padding: "10px 16px" }} disabled={!!busy}
            onClick={() => run("set_streak", Number(streak) || 0, `Streak set to ${Number(streak) || 0}`)}>Set</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Reminders</h3>
        <B a="test_reminder" label="Send me a reminder now" done="Check your chat with the bot" />
        <B a="cooldown_ready_soon" label="Real reminder test (about 5 min)" done="Cooldown ends in 1 min. The reminder job runs every 5 min." ghost />
        <p className="hint">The second button turns cooldown skipping off and makes your free roll ready in a minute, so you get the real reminder.</p>
      </div>
    </>
  );
}
