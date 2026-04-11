import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// One-time migration helper — check if api_key / github_repo_url columns exist
export async function GET() {
  const { error } = await supabaseAdmin
    .from('apis')
    .select('api_key, github_repo_url')
    .limit(1);

  if (error?.code === 'PGRST204' || error?.message?.includes('api_key')) {
    return NextResponse.json({
      status: 'migration_needed',
      sql: [
        'ALTER TABLE apis ADD COLUMN IF NOT EXISTS api_key text;',
        'ALTER TABLE apis ADD COLUMN IF NOT EXISTS github_repo_url text;',
      ],
      dashboard: 'https://supabase.com/dashboard/project/gjohssjqxdskjcuqzgct/sql',
    });
  }

  return NextResponse.json({ status: 'ok', message: 'Columns already exist' });
}
