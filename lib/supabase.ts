import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const secret = process.env.SUPABASE_SECRET_KEY!;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;

// Server-side client — uses secret key, bypasses RLS. Only import in API routes / server code.
export const supabaseAdmin = createClient(url, secret);

// Client-side safe client — uses publishable (anon) key, respects RLS.
const clientUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const clientKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const supabase = createClient(clientUrl || url, clientKey || publishable);

// ── Types matching the schema ──────────────────────────────────────────────

export type ApiRecord = {
  id: string;
  name: string;
  description: string;
  category: string;
  server_js: string;
  package_json: string;
  env_example: string;
  railway_url: string | null;
  railway_project_id: string | null;
  api_key: string | null;
  github_repo_url: string | null;
  status: 'deploying' | 'live' | 'failed';
  free_calls_used: number;
  created_at: string;
};

export type ApiKey = {
  id: string;
  api_id: string;
  key: string;
  email: string;
  plan: 'free' | 'starter' | 'pro';
  calls_used: number;
  calls_limit: number;
  created_at: string;
};

export type FreeTest = {
  id: string;
  api_id: string;
  ip: string;
  called_at: string;
};
