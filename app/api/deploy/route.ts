import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
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

function withStartScript(raw: string): string {
  try {
    const pkg = JSON.parse(raw);
    if (!pkg.scripts?.start) {
      pkg.scripts = { ...pkg.scripts, start: 'node server.js' };
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
      { ok: false, error: 'serverJs and name are required' },
      { status: 400 }
    );
  }

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'GITHUB_TOKEN not set' },
      { status: 500 }
    );
  }

  const slug = `apiforge-${randomUUID().slice(0, 8)}`;
  const owner = 'abdelrahman3860';

  try {
    // ── 1. Create public GitHub repo via REST API (no git/gh CLI) ──────────
    await github('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: slug,
        private: false,
        auto_init: false,
        description: `APIForge: ${name}`,
      }),
    });

    const repoUrl = `https://github.com/${owner}/${slug}`;

    // ── 2. Upload files via GitHub Contents API ────────────────────────────
    await uploadFile(owner, slug, 'server.js', serverJs);
    await uploadFile(
      owner,
      slug,
      'package.json',
      withStartScript(packageJson || '{"name":"api","version":"1.0.0","scripts":{}}')
    );
    if (envExample) {
      await uploadFile(owner, slug, '.env.example', envExample);
    }

    // ── 3. Create Railway project ──────────────────────────────────────────
    const { projectCreate } = await gql<{
      projectCreate: { id: string; baseEnvironment: { id: string } };
    }>(`mutation {
      projectCreate(input: { name: "${slug}" }) {
        id
        baseEnvironment { id }
      }
    }`);

    const projectId = projectCreate.id;
    const environmentId = projectCreate.baseEnvironment.id;

    // ── 4. Create service linked to the GitHub repo (triggers auto-deploy) ─
    const { serviceCreate } = await gql<{ serviceCreate: { id: string } }>(
      `mutation {
        serviceCreate(input: {
          projectId: "${projectId}"
          name: "api"
          source: { repo: "${owner}/${slug}" }
        }) {
          id
        }
      }`
    );

    const serviceId = serviceCreate.id;

    // ── 5. Explicitly trigger deploy ───────────────────────────────────────
    await gql(
      `mutation {
        serviceInstanceDeployV2(
          serviceId: "${serviceId}"
          environmentId: "${environmentId}"
        )
      }`
    ).catch(() => {});

    // ── 6. Poll for Railway-generated domain (up to ~30s) ──────────────────
    let railwayUrl = `https://railway.app/project/${projectId}`;

    for (let attempt = 0; attempt < 6; attempt++) {
      await sleep(5000);
      try {
        const { serviceInstance } = await gql<{
          serviceInstance: {
            domains: { serviceDomains: { domain: string }[] };
          };
        }>(
          `query {
            serviceInstance(serviceId: "${serviceId}", environmentId: "${environmentId}") {
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

    // ── 7. Persist to Supabase ─────────────────────────────────────────────
    const { data, error } = await supabaseAdmin
      .from('apis')
      .insert({
        name,
        description: description || name,
        category: category || 'Utility',
        server_js: serverJs,
        package_json: packageJson || '',
        env_example: envExample || '',
        railway_url: railwayUrl,
        railway_project_id: projectId,
        status: 'deploying',
      })
      .select()
      .single();

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
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Deployment failed';
    console.error('[deploy]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
