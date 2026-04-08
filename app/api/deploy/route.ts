import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

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

// Ensure package.json always has a start script for Railway/nixpacks
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

  const slug = `apiforge-${randomUUID().slice(0, 8)}`;
  const tempDir = mkdtempSync(join(tmpdir(), 'apiforge-'));

  try {
    // ── 1. Write generated files to temp directory ─────────────────────────
    writeFileSync(join(tempDir, 'server.js'), serverJs);
    writeFileSync(
      join(tempDir, 'package.json'),
      withStartScript(packageJson || '{"name":"api","version":"1.0.0","scripts":{}}')
    );
    if (envExample) {
      writeFileSync(join(tempDir, '.env.example'), envExample);
    }

    // ── 2. Push to a new public GitHub repo via gh CLI ─────────────────────
    for (const cmd of [
      'git init -b main',
      'git config user.email "deploy@apiforge.app"',
      'git config user.name "APIForge Bot"',
      'git add .',
      'git commit -m "Initial API deployment"',
      `gh repo create abdelrahman3860/${slug} --public --source=. --push --remote=origin`,
    ]) {
      execSync(cmd, { cwd: tempDir, stdio: 'pipe' });
    }

    const repoUrl = `https://github.com/abdelrahman3860/${slug}`;

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
          source: { repo: "abdelrahman3860/${slug}" }
        }) {
          id
        }
      }`
    );

    const serviceId = serviceCreate.id;

    // ── 5. Explicitly trigger deploy (in case auto-deploy didn't fire) ─────
    await gql(
      `mutation {
        serviceInstanceDeployV2(
          serviceId: "${serviceId}"
          environmentId: "${environmentId}"
        )
      }`
    ).catch(() => {
      // Non-fatal: serviceCreate may have already triggered the deployment
    });

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

    return NextResponse.json({
      ok: true,
      id: data.id,
      railwayUrl,
      repoUrl,
      projectId,
      serviceId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Deployment failed';
    console.error('[deploy]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
