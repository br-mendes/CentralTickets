import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "missing_secret" }, { status: 500 });
  }

  const url = new URL("/api/cron/sync", req.nextUrl.origin);

  const response = await fetch(url, {
    headers: {
      "x-cron-secret": secret,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: payload?.error ?? "sync_failed" },
      { status: response.status }
    );
  }

  return NextResponse.json({ ok: true, result: payload });
}
