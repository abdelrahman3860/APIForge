import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Railway webhook payload (https://docs.railway.app/reference/webhooks)
type RailwayPayload = {
  type: string;
  timestamp: string;
  project: { id: string; name: string };
  environment: { id: string; name: string };
  deployment?: {
    id: string;
    status: string;       // SUCCESS | FAILED | CRASHED | DEPLOYING | BUILDING | …
    url?: string;         // populated once live
    meta?: { branch?: string; commitMessage?: string };
  };
};

const TERMINAL_SUCCESS = new Set(['SUCCESS']);
const TERMINAL_FAILURE = new Set(['FAILED', 'CRASHED', 'REMOVED']);

export async function POST(req: NextRequest) {
  // Optional shared secret — set RAILWAY_WEBHOOK_SECRET in env to enable
  const secret = process.env.RAILWAY_WEBHOOK_SECRET;
  if (secret) {
    const incoming = req.headers.get('x-railway-signature') ?? req.nextUrl.searchParams.get('secret');
    if (incoming !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let payload: RailwayPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = payload.project?.id;
  const status    = payload.deployment?.status;
  const url       = payload.deployment?.url;

  if (!projectId || !status) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Only act on terminal states
  if (!TERMINAL_SUCCESS.has(status) && !TERMINAL_FAILURE.has(status)) {
    return NextResponse.json({ ok: true, skipped: true, status });
  }

  const newStatus: 'live' | 'failed' = TERMINAL_SUCCESS.has(status) ? 'live' : 'failed';

  // Build update object — include railway_url only if Railway provided one
  const update: Record<string, unknown> = { status: newStatus };
  if (url && newStatus === 'live') {
    update.railway_url = url.startsWith('http') ? url : `https://${url}`;
  }

  const { error } = await supabaseAdmin
    .from('apis')
    .update(update)
    .eq('railway_project_id', projectId);

  if (error) {
    console.error('[webhook/railway] Supabase update failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[webhook/railway] project=${projectId} → ${newStatus}${url ? ` url=${url}` : ''}`);
  return NextResponse.json({ ok: true, projectId, newStatus });
}
