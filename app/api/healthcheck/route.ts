import { NextRequest, NextResponse } from 'next/server';

// Server-side health proxy — avoids CORS issues when the browser polls a deployed API's /health
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'APIForge-healthcheck/1.0' },
    });
    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch {
    return NextResponse.json({ ok: false, status: 0 });
  }
}
