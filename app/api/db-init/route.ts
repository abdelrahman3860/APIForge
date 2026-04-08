import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const TABLES = ['apis', 'api_keys', 'free_tests'] as const;

export async function GET() {
  const results: Record<string, { ok: boolean; error?: string; count?: number }> = {};

  for (const table of TABLES) {
    const { count, error } = await supabaseAdmin
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      results[table] = { ok: false, error: error.message };
    } else {
      results[table] = { ok: true, count: count ?? 0 };
    }
  }

  const allOk = Object.values(results).every((r) => r.ok);

  if (!allOk) {
    return NextResponse.json(
      {
        ok: false,
        tables: results,
        action: 'Run supabase/schema.sql in your Supabase SQL Editor',
        url: `https://supabase.com/dashboard/project/gjohssjqxdskjcuqzgct/sql`,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, tables: results });
}
