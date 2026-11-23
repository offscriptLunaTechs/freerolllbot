# Free Roll (Telegram Mini App)

One free roll every hour. Roll 0000–9999, win points, climb the leaderboard.
Bonus rolls can be bought with Telegram Stars. A TON wallet can be linked (display only for now).

Points have **no cash value** and cannot be withdrawn. See "Real-money payouts" below before changing that.

## Stack
- Next.js 15 (App Router) on Vercel: the mini app UI and the API routes
- Supabase Postgres: all game state, the roll itself runs inside a Postgres function (`public.api_roll`)
- Telegram Bot API: initData validation, Stars (XTR) invoices, webhook
- TON Connect: wallet linking

## How it works
- Every API call sends `Authorization: tma <initData>`; the server checks the HMAC with the bot token (`lib/telegram.ts`).
- Tables live in the private `app` schema, which the Supabase API does not expose.
  The only entry points are the `public.api_*` functions, and each one checks `API_SECRET`
  against `app.config.api_secret`. So the publishable key alone cannot read or change anything.
- Rolls are provably fair: `roll = floor(uint32(HMAC_SHA256(server_seed, client_seed:nonce)[0..4]) / 2^32 * 10000)`.
  The player sees `sha256(server_seed)` before rolling, and rotating the seed reveals it. The "Fair" tab verifies rolls in the browser.
- Stars: `/api/stars/invoice` creates an XTR invoice link. The webhook answers `pre_checkout_query`
  and credits bonus rolls on `successful_payment` (idempotent on `telegram_payment_charge_id`).

## Engagement features
- **Daily streak**: rolling on consecutive UTC days raises a prize multiplier by 0.1 per day, up to x2.0.
- **Referrals**: invite link `t.me/<bot>?start=ref_<id>`. The inviter earns 10% of everything the friend wins; the friend starts with +50 points.
- **Levels**: level n needs 25·(n-1)² points (display only).
- **Weekly season**: the Top tab shows points won since Monday 00:00 UTC, plus all-time.
- **Reminders**: Supabase `pg_cron` calls `/api/cron/remind` every 5 minutes; the bot messages players whose free roll is ready again.
- **Share to story**: `/api/story` renders a 1080x1920 image of the last roll.

## Settings
- Cooldown: `update app.config set value = '30' where key = 'cooldown_minutes';`
- Referral %, welcome bonus, streak step and cap: `ref_percent`, `welcome_bonus`, `streak_step`, `streak_max` in `app.config`.
- Prize table: `app.prize_for(roll)` in SQL, and the `PRIZES` list in `components/App.tsx` for display.
- Stars packs: `lib/products.ts`.

## Env vars (Vercel)
See `.env.example`. After setting them and deploying, open
`https://<your-app>/api/telegram/setup?key=<API_SECRET>` once to register the webhook and the menu button.

## Real-money payouts
Paying out Stars, TON or any token as a prize for a chance-based game is gambling in most countries
and is against Telegram's rules for mini apps unless you hold a gambling licence. Keep prizes as points,
cosmetics or leaderboard rewards unless you have that licence.
