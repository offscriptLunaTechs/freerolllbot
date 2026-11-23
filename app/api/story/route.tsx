import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

/** 1080x1920 image used for "Share to story". */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const roll = String(Math.min(9999, Math.max(0, Number(q.get("roll")) || 0))).padStart(4, "0");
  const prize = Math.max(0, Number(q.get("prize")) || 0).toLocaleString("en-US");
  const streak = Math.max(0, Number(q.get("streak")) || 0);
  const big = Number(q.get("prize")) >= 100;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", background: big ? "linear-gradient(160deg,#2a1a00,#0f1115 60%)" : "linear-gradient(160deg,#0b1f3f,#0f1115 60%)",
          color: "white", fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 64, opacity: 0.8, display: "flex" }}>FREE ROLL</div>
        <div style={{ display: "flex", gap: 24, marginTop: 80 }}>
          {roll.split("").map((d, i) => (
            <div key={i} style={{ width: 190, height: 260, borderRadius: 32, background: "#1d2230", display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: 200, fontWeight: 800, color: big ? "#f5b301" : "white" }}>{d}</div>
          ))}
        </div>
        <div style={{ fontSize: 96, fontWeight: 800, marginTop: 80, color: big ? "#f5b301" : "white", display: "flex" }}>+{prize} points</div>
        {streak > 1 ? <div style={{ fontSize: 56, marginTop: 24, display: "flex" }}>{streak}-day streak</div> : null}
        <div style={{ fontSize: 48, marginTop: 120, opacity: 0.7, display: "flex" }}>One free roll every hour. Can you beat it?</div>
      </div>
    ),
    { width: 1080, height: 1920 }
  );
}
