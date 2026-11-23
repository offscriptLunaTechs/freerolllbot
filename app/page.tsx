"use client";

import dynamic from "next/dynamic";

// Telegram and TON Connect both need `window`, so render the app on the client only.
const App = dynamic(() => import("@/components/App"), { ssr: false });

export default function Page() {
  return <App />;
}
