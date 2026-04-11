import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

// ── GitHub REST API client ─────────────────────────────────────────────────

async function github(path: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? `GitHub ${res.status}`);
  return json;
}

async function uploadFile(owner: string, repo: string, path: string, content: string) {
  await github(`/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'Initial API deployment',
      content: Buffer.from(content, 'utf-8').toString('base64'),
    }),
  });
}

// ── Railway GraphQL client ─────────────────────────────────────────────────

async function gql<T = Record<string, unknown>>(query: string): Promise<T> {
  const res = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RAILWAY_TOKEN}`,
    },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripMarkdownFences(code: string): string {
  // Remove leading ``` fences with any language tag (javascript, js, node, json, etc.)
  return code
    .replace(/^```\w*\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
}

function withStartScript(raw: string): string {
  try {
    const pkg = JSON.parse(raw);
    if (!pkg.scripts?.start) {
      pkg.scripts = { ...pkg.scripts, start: 'node server.js' };
    }
    // Ensure Node 18+ so packages like undici / axios v1 don't crash on Railway
    if (!pkg.engines) {
      pkg.engines = { node: '>=18' };
    }
    return JSON.stringify(pkg, null, 2);
  } catch {
    return raw;
  }
}

// ── POST /api/deploy ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { serverJs, packageJson, envExample, name, description, category } =
    await req.json();

  if (!serverJs || !name) {
    return NextResponse.json(
      { ok: false, error: 'Generated code was incomplete — the AI response did not include all required sections. Try generating again.' },
      { status: 400 }
    );
  }

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'GITHUB_TOKEN not set' },
      { status: 500 }
    );
  }

  if (!process.env.RAILWAY_PROJECT_ID) {
    return NextResponse.json(
      { ok: false, error: 'RAILWAY_PROJECT_ID not set' },
      { status: 500 }
    );
  }

  // Fix #1 — generate a random deployment-specific API key
  const apiKey = randomBytes(24).toString('hex');

  const slug = `apiforge-${randomUUID().slice(0, 8)}`;
  const owner = 'abdelrahman3860';

  try {
    // ── 1. Create public GitHub repo via REST API (no git/gh CLI) ──────────
    await github('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: slug,
        private: false,
        auto_init: true,   // creates initial commit so repo is immediately accessible
        description: `APIForge: ${name}`,
      }),
    });

    const repoUrl = `https://github.com/${owner}/${slug}`;

    // Give GitHub a moment to fully propagate the new repo before uploading
    await sleep(2000);

    // ── 2. Upload files via GitHub Contents API ────────────────────────────
    await uploadFile(owner, slug, 'server.js', stripMarkdownFences(serverJs));
    await uploadFile(
      owner,
      slug,
      'package.json',
      withStartScript(stripMarkdownFences(packageJson) || '{"name":"api","version":"1.0.0","scripts":{}}')
    );
    if (envExample) {
      // Fix #8 — strip any real values from .env.example before committing to a public repo
      const safeEnvExample = stripMarkdownFences(envExample)
        .split('\n')
        .map(line => {
          // Replace any value that doesn't look like a placeholder
          const match = line.match(/^([A-Z0-9_]+=)(.+)$/);
          if (!match) return line;
          const [, key, val] = match;
          const isPlaceholder = /your[_\-]?/i.test(val) || val.startsWith('<') || val.startsWith('xxx');
          return isPlaceholder ? line : `${key}your_${key.replace('=', '').toLowerCase()}_here`;
        })
        .join('\n');
      await uploadFile(owner, slug, '.env.example', safeEnvExample);
    }

    // ── 3. Use shared Railway project (Fix #2 — no per-deploy projectCreate) ─
    const projectId = process.env.RAILWAY_PROJECT_ID;

    const { project } = await gql<{
      project: { environments: { edges: { node: { id: string } }[] } };
    }>(`query { project(id: "${projectId}") { environments { edges { node { id } } } } }`);

    const envId = project.environments.edges[0]?.node?.id ?? null;
    if (!envId) throw new Error('Could not resolve Railway environment ID');

    // ── 4. Create service linked to the GitHub repo (triggers auto-deploy) ─
    const { serviceCreate } = await gql<{ serviceCreate: { id: string } }>(
      `mutation {
        serviceCreate(input: {
          projectId: "${projectId}"
          name: "${slug}"
          source: { repo: "${owner}/${slug}" }
        }) {
          id
        }
      }`
    );

    const serviceId = serviceCreate.id;

    // ── 4b. Inject API_KEY into the service environment (Fix #1) ──────────
    await gql(
      `mutation {
        serviceVariableUpsert(input: {
          serviceId: "${serviceId}"
          environmentId: "${envId}"
          name: "API_KEY"
          value: "${apiKey}"
        })
      }`
    ).catch(() => {});

    // ── 4c. Create a public domain for the service ─────────────────────────
    let assignedDomain: string | null = null;
    try {
      const { serviceDomainCreate } = await gql<{
        serviceDomainCreate: { domain: string };
      }>(
        `mutation {
          serviceDomainCreate(input: {
            serviceId: "${serviceId}"
            environmentId: "${envId}"
          }) {
            domain
          }
        }`
      );
      assignedDomain = serviceDomainCreate.domain ?? null;
    } catch {
      // Domain creation failed — will fall back to polling
    }

    // ── 5. Explicitly trigger deploy ───────────────────────────────────────
    await gql(
      `mutation {
        serviceInstanceDeployV2(
          serviceId: "${serviceId}"
          environmentId: "${envId}"
        )
      }`
    ).catch(() => {});

    // ── 6. Use assigned domain or poll for Railway-generated domain (up to ~30s) ──
    let railwayUrl = assignedDomain
      ? `https://${assignedDomain}`
      : `https://railway.app/project/${projectId}`;

    for (let attempt = 0; !assignedDomain && attempt < 6; attempt++) {
      await sleep(5000);
      try {
        const { serviceInstance } = await gql<{
          serviceInstance: {
            domains: { serviceDomains: { domain: string }[] };
          };
        }>(
          `query {
            serviceInstance(serviceId: "${serviceId}", environmentId: "${envId}") {
              domains {
                serviceDomains { domain }
              }
            }
          }`
        );
        const first = serviceInstance?.domains?.serviceDomains?.[0];
        if (first?.domain) {
          railwayUrl = `https://${first.domain}`;
          break;
        }
      } catch {
        // Domain not assigned yet — keep polling
      }
    }

    // ── 7. Persist to Supabase (Fix #7 — include api_key + github_repo_url) ─
    const baseRecord = {
      name,
      description: description || name,
      category: category || 'Utility',
      server_js: serverJs,
      package_json: packageJson || '',
      env_example: envExample || '',
      railway_url: railwayUrl,
      railway_project_id: projectId,
      status: 'deploying' as const,
    };

    // Try with new columns first; fall back if schema not yet migrated (PGRST204)
    let { data, error } = await supabaseAdmin
      .from('apis')
      .insert({ ...baseRecord, api_key: apiKey, github_repo_url: repoUrl })
      .select()
      .single();

    if (error?.code === 'PGRST204') {
      // Columns don't exist yet — insert without them
      ({ data, error } = await supabaseAdmin
        .from('apis')
        .insert(baseRecord)
        .select()
        .single());
    }

    if (error) throw error;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.up.railway.app';
    const webhookUrl = `${appUrl}/api/webhooks/railway${
      process.env.RAILWAY_WEBHOOK_SECRET
        ? `?secret=${process.env.RAILWAY_WEBHOOK_SECRET}`
        : ''
    }`;

    return NextResponse.json({
      ok: true,
      id: data.id,
      railwayUrl,
      repoUrl,
      projectId,
      serviceId,
      webhookUrl,
      apiKey,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Deployment failed';
    console.error('[deploy]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
