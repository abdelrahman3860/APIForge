-- APIForge schema
-- Run this once in your Supabase SQL Editor: https://supabase.com/dashboard/project/gjohssjqxdskjcuqzgct/sql

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── apis ──────────────────────────────────────────────────────────────────
create table if not exists apis (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text not null,
  category            text not null default 'Utility',
  server_js           text not null default '',
  package_json        text not null default '',
  env_example         text not null default '',
  railway_url         text,
  railway_project_id  text,
  status              text not null default 'deploying'
                        check (status in ('deploying', 'live', 'failed')),
  free_calls_used     integer not null default 0,
  created_at          timestamptz not null default now()
);

-- ── api_keys ──────────────────────────────────────────────────────────────
create table if not exists api_keys (
  id          uuid primary key default gen_random_uuid(),
  api_id      uuid not null references apis(id) on delete cascade,
  key         text not null unique,
  email       text not null,
  plan        text not null default 'free'
                check (plan in ('free', 'starter', 'pro')),
  calls_used  integer not null default 0,
  calls_limit integer not null default 10,
  created_at  timestamptz not null default now()
);

-- ── free_tests ────────────────────────────────────────────────────────────
create table if not exists free_tests (
  id        uuid primary key default gen_random_uuid(),
  api_id    uuid not null references apis(id) on delete cascade,
  ip        text not null,
  called_at timestamptz not null default now()
);

-- Indexes for common lookups
create index if not exists api_keys_api_id_idx  on api_keys(api_id);
create index if not exists api_keys_key_idx     on api_keys(key);
create index if not exists free_tests_api_ip_idx on free_tests(api_id, ip);

-- Row Level Security (permissive for now — tighten per-table later)
alter table apis       enable row level security;
alter table api_keys   enable row level security;
alter table free_tests enable row level security;

-- Allow server-side (service role) full access; anon can only read apis
create policy "service role full access" on apis       for all using (true);
create policy "service role full access" on api_keys   for all using (true);
create policy "service role full access" on free_tests for all using (true);

create policy "public can read live apis" on apis
  for select using (status = 'live');
