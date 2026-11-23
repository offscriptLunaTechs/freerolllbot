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
  server_time: string;
};
type RollRow = { id: number; kind: string; roll: number; prize: number; server_seed_hash: string; client_seed: string; nonce: number; created_at: string };
type Revealed = { id?: number; server_seed: string; server_seed_hash: string; client_seed: string; last_nonce: number };
type Tab = "roll" | "top" | "fair" | "shop";

const PRIZES = [
  { range: "0 – 8999", prize: 5 },
  { range: "9000 – 9899", prize: 25 },
  { range: "9900 – 9989", prize: 100 },
  { range: "9990 – 9998", prize: 1000 },
  { range: "9999", prize: 10000 },
];

declare global {
  interface Window { Telegram?: any }
}

const tg = () => (typeof window !== "undefined" ? window.Telegram?.WebApp : undefined);

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
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function AppRoot() {
  const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;
  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <Game />
    </TonConnectUIProvider>
  );
}

function Game() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("roll");
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0); // server clock minus local clock

  const apply = useCallback((s: State) => {
    offset.current = new Date(s.server_time).getTime() - Date.now();
    setState(s);
  }, []);

  useEffect(() => {
    const w = tg();
    w?.ready();
    w?.expand();
    if (!w?.initData) {
      setError("Open this app from the Telegram bot to play.");
      return;
    }
    api<State>("/api/me").then(apply).catch((e) => setError(String(e.message || e)));
  }, [apply]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  if (error) return <div className="card"><h2>🎲 Free Roll</h2><p className="hint">{error}</p></div>;
  if (!state) return <div className="card"><p className="hint">Loading…</p></div>;

  const serverNow = now + offset.current;
  const nextAt = state.next_free_roll_at ? new Date(state.next_free_roll_at).getTime() : 0;
  const waitMs = Math.max(0, nextAt - serverNow);

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <div className="hint">Points</div>
          <div className="stat">⭐ {state.points.toLocaleString()}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="hint">Bonus rolls</div>
          <div className="stat">{state.bonus_rolls}</div>
        </div>
      </div>

      {tab === "roll" && <RollTab state={state} apply={apply} waitMs={waitMs} />}
      {tab === "top" && <TopTab />}
      {tab === "fair" && <FairTab state={state} apply={apply} />}
      {tab === "shop" && <ShopTab state={state} apply={apply} />}

      <nav className="tabs">
        {([["roll", "🎲", "Roll"], ["top", "🏆", "Top"], ["fair", "🔐", "Fair"], ["shop", "✨", "Shop"]] as const).map(([id, ico, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => { tg()?.HapticFeedback?.selectionChanged(); setTab(id); }}>
            <span className="ico">{ico}</span>{label}
          </button>
        ))}
      </nav>
    </>
  );
}

function RollTab({ state, apply, waitMs }: { state: State; apply: (s: State) => void; waitMs: number }) {
  const [display, setDisplay] = useState<number | null>(null);
  const [last, setLast] = useState<{ roll: number; prize: number; kind: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const free = waitMs <= 0;
  const canRoll = !busy && (free || state.bonus_rolls > 0);

  async function roll() {
    setBusy(true);
    setLast(null);
    const spin = setInterval(() => setDisplay(Math.floor(Math.random() * 10000)), 50);
    try {
      const [res] = await Promise.all([api("/api/roll"), new Promise((r) => setTimeout(r, 900))]);
      clearInterval(spin);
      if (res.error === "cooldown") {
        apply(res.state);
        setDisplay(null);
        return;
      }
      setDisplay(res.roll);
      setLast({ roll: res.roll, prize: res.prize, kind: res.kind });
      apply(res.state);
      tg()?.HapticFeedback?.notificationOccurred(res.prize >= 100 ? "success" : "warning");
    } catch (e: any) {
      clearInterval(spin);
      setDisplay(null);
      tg()?.showAlert?.(`Roll failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className={`big ${last && last.prize >= 100 ? "win" : ""}`}>
          {display === null ? "????" : String(display).padStart(4, "0")}
        </div>
        <p className="hint" style={{ textAlign: "center", minHeight: 20 }}>
          {last ? `+${last.prize} points${last.kind === "bonus" ? " (bonus roll)" : ""}` : "Roll a number from 0000 to 9999"}
        </p>
        <button className="btn" disabled={!canRoll} onClick={roll}>
          {busy ? "Rolling…" : free ? "Free roll" : state.bonus_rolls > 0 ? `Use bonus roll (${state.bonus_rolls})` : `Next free roll in ${fmt(waitMs)}`}
        </button>
        {!free && state.bonus_rolls > 0 && <p className="hint" style={{ textAlign: "center" }}>Free roll in {fmt(waitMs)}</p>}
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
        <p className="hint">Points are for fun and the leaderboard. They have no cash value and cannot be withdrawn.</p>
      </div>
    </>
  );
}

function TopTab() {
  const [data, setData] = useState<{ top: { name: string; points: number; total_rolls: number }[]; my_rank: number } | null>(null);
  useEffect(() => { api("/api/leaderboard").then(setData).catch(() => setData({ top: [], my_rank: 0 })); }, []);
  if (!data) return <div className="card hint">Loading…</div>;
  return (
    <div className="card">
      <div className="row"><h3 style={{ margin: 0 }}>Leaderboard</h3>{data.my_rank > 0 && <span className="pill">You: #{data.my_rank}</span>}</div>
      <table>
        <thead><tr><th>#</th><th>Player</th><th style={{ textAlign: "right" }}>Points</th></tr></thead>
        <tbody>
          {data.top.map((r, i) => (
            <tr key={i}><td>{i + 1}</td><td>{r.name}</td><td style={{ textAlign: "right" }}>{r.points.toLocaleString()}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
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
    if (!rev) return setChecks((c) => ({ ...c, [r.id]: "Seed not revealed yet. Rotate your seed first." }));
    const hashOk = (await sha256Hex(rev.server_seed)) === r.server_seed_hash;
    const value = await hmacRoll(rev.server_seed, r.client_seed, r.nonce);
    setChecks((c) => ({ ...c, [r.id]: hashOk && value === r.roll ? `✅ Verified: ${value}` : `❌ Mismatch (got ${value})` }));
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
          tg()?.HapticFeedback?.notificationOccurred("success");
          // The webhook credits the rolls; poll briefly until they show up.
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
        <p className="hint">Skip the wait. Bonus rolls are used when your free roll is on cooldown.</p>
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
