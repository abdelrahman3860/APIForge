import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

export async function POST(req: NextRequest) {
  const { apiId, railwayUrl, apiKey } = await req.json();

  if (!apiId || !railwayUrl) {
    return NextResponse.json({ error: 'apiId and railwayUrl required' }, { status: 400 });
  }

  const ip = clientIp(req);

  // ── Key-authenticated request ────────────────────────────────────────────
  if (apiKey) {
    const { data: keyRecord, error } = await supabaseAdmin
      .from('api_keys')
      .select('id, calls_used, calls_limit')
      .eq('key', apiKey)
      .eq('api_id', apiId)
      .maybeSingle();

    if (error || !keyRecord) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    if (keyRecord.calls_used >= keyRecord.calls_limit) {
      return NextResponse.json(
        { error: 'API key limit reached. Upgrade your plan.' },
        { status: 429 }
      );
    }

    await supabaseAdmin
      .from('api_keys')
      .update({ calls_used: keyRecord.calls_used + 1 })
      .eq('id', keyRecord.id);

    return proxyTest(railwayUrl, apiKey);
  }

  // ── Free test ─────────────────────────────────────────────────────────────
  const { data: existingTest } = await supabaseAdmin
    .from('free_tests')
    .select('id')
    .eq('api_id', apiId)
    .eq('ip', ip)
    .maybeSingle();

  if (existingTest) {
    return NextResponse.json(
      { error: 'Free test already used. Get an API key to continue.', code: 'FREE_TEST_USED' },
      { status: 402 }
    );
  }

  // Record the free test and bump counter
  await supabaseAdmin.from('free_tests').insert({ api_id: apiId, ip });
  // Increment free_calls_used via read-modify-write
  const { data: apiRow } = await supabaseAdmin
    .from('apis')
    .select('free_calls_used')
    .eq('id', apiId)
    .single();
  if (apiRow) {
    await supabaseAdmin
      .from('apis')
      .update({ free_calls_used: (apiRow.free_calls_used ?? 0) + 1 })
      .eq('id', apiId);
  }

  return proxyTest(railwayUrl);
}

// ── Proxy helper ─────────────────────────────────────────────────────────────

async function proxyTest(railwayUrl: string, apiKey?: string): Promise<NextResponse> {
  const base = railwayUrl.replace(/\/$/, '');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
  };

  let upstream: Response;
  try {
    // Try /health first, fall back to root
    try {
      upstream = await fetch(`${base}/health`, { headers });
    } catch {
      upstream = await fetch(base, { headers });
    }
  } catch {
    return NextResponse.json({ error: 'Could not reach the API' }, { status: 502 });
  }

  const text = await upstream.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return NextResponse.json(
    { ok: upstream.ok, status: upstream.status, data: body },
    { status: upstream.ok ? 200 : upstream.status }
  );
}
