import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const url = process.env.APP_URL || req.nextUrl.origin;
  return NextResponse.json({ url, name: "Free Roll", iconUrl: `${url}/icon.png` });
}
