import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { email, apiId } = await req.json();

  if (!email?.trim() || !apiId) {
    return NextResponse.json({ error: 'email and apiId required' }, { status: 400 });
  }

  // Check if this email already has a key for this API
  const { data: existing } = await supabaseAdmin
    .from('api_keys')
    .select('key')
    .eq('api_id', apiId)
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, key: existing.key, existing: true });
  }

  const key = `ak_${randomUUID().replace(/-/g, '')}`;

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .insert({
      api_id: apiId,
      key,
      email: email.trim().toLowerCase(),
      plan: 'free',
      calls_used: 0,
      calls_limit: 10,
    })
    .select('key')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, key: data.key });
}
