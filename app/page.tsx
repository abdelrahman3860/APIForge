'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import ApiTester from './components/ApiTester';

// ── Types ──────────────────────────────────────────────────────────────────

type ParsedResult = {
  name: string;
  category: string;
  approach: string;
  serverJs: string;
  packageJson: string;
  envExample: string;
  deploy: string;
};

type Tab = 'server.js' | 'package.json' | '.env.example';
type DeployPhase = 'idle' | 'deploying' | 'building' | 'live' | 'failed';

type MarketplaceApi = {
  id: string;
  name: string;
  description: string;
  category: string;
  railway_url: string | null;
  status: string;
  free_calls_used: number;
  created_at: string;
};

// ── Constants ──────────────────────────────────────────────────────────────

const EXAMPLES = [
  'I want an API that converts YouTube videos to MP3',
  'Build me an API that generates QR codes from any URL',
  'I need an API that sends SMS notifications via Twilio',
  'Create an API that scrapes product prices from Amazon',
  'I want an API that translates text between any languages',
  'Build me an API that generates PDF invoices from JSON data',
];

const CATEGORY_STYLES: Record<string, string> = {
  AI:        'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  Media:     'bg-pink-500/10 text-pink-400 border border-pink-500/20',
  Data:      'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  Messaging: 'bg-green-500/10 text-green-400 border border-green-500/20',
  Language:  'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  Utility:   'bg-violet-500/10 text-violet-400 border border-violet-500/20',
};

const DEPLOY_STEPS = [
  'Pushing code to GitHub…',
  'Creating Railway project…',
  'Configuring deployment…',
  'Waiting for live URL…',
];

const CATEGORIES = ['All', 'AI', 'Media', 'Data', 'Messaging', 'Language', 'Utility'];

// ── Helpers ────────────────────────────────────────────────────────────────

function extract(text: string, open: string, close: string): string {
  const s = text.indexOf(open);
  const e = text.indexOf(close);
  if (s === -1 || e === -1) return '';
  let content = text.slice(s + open.length, e).trim();
  // Fix #4 — strip markdown code fences the LLM sometimes wraps blocks in
  content = content.replace(/^```\w*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  return content;
}

function parseResult(raw: string): ParsedResult {
  return {
    name:        extract(raw, '===NAME===',         '===END_NAME==='),
    category:    extract(raw, '===CATEGORY===',     '===END_CATEGORY==='),
    approach:    extract(raw, '===APPROACH===',     '===END_APPROACH==='),
    serverJs:    extract(raw, '===SERVER_JS===',    '===END_SERVER_JS==='),
    packageJson: extract(raw, '===PACKAGE_JSON===', '===END_PACKAGE_JSON==='),
    envExample:  extract(raw, '===ENV_EXAMPLE===',  '===END_ENV_EXAMPLE==='),
    deploy:      extract(raw, '===DEPLOY===',       '===END_DEPLOY==='),
  };
}

function detectCategory(desc: string): string {
  const d = desc.toLowerCase();
  if (/\b(ai|gpt|claude|llm|sentiment|summarize|openai|anthropic)\b/.test(d)) return 'AI';
  if (/\b(video|audio|image|photo|mp3|mp4|youtube|screenshot|pdf)\b/.test(d))  return 'Media';
  if (/\b(sms|email|notification|twilio|sendgrid|whatsapp|slack)\b/.test(d))   return 'Messaging';
  if (/\b(translate|language|nlp|speech|ocr)\b/.test(d))                       return 'Language';
  if (/\b(scrape|price|amazon|crawl|parse|data|extract)\b/.test(d))            return 'Data';
  return 'Utility';
}

function resolvedName(result: ParsedResult, input: string): string {
  if (result.name) return result.name;
  return input
    .replace(/^(i want|build me|create|i need|make|give me)\s+an?\s+api\s+(that\s+)?/i, '')
    .replace(/^(i want|build me|create|i need|make)\s+/i, '')
    .split(/\s+/).slice(0, 6).join(' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

// ── Shared sub-components ──────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all duration-150
                 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 border border-white/5">
      {copied ? (
        <><svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          <span className="text-green-400">Copied!</span></>
      ) : (
        <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          {label}</>
      )}
    </button>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.Utility;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>
      {category || 'Utility'}
    </span>
  );
}

function KeyForm({ apiId }: { apiId?: string }) {
  const [email, setEmail]   = useState('');
  const [key, setKey]       = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !apiId) return;
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, apiId }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setKey(data.key);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate key');
    } finally { setLoading(false); }
  }

  function copyKey() { navigator.clipboard.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  if (key) return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-4 space-y-2">
      <p className="text-xs text-violet-300 font-medium">Your API key — 10 free calls included</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono text-white bg-black/30 rounded-lg px-3 py-2 truncate">{key}</code>
        <button onClick={copyKey}
          className="flex-shrink-0 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs rounded-lg transition-colors font-medium">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className="text-xs text-gray-500">Pass as the <code className="font-mono text-gray-400">X-API-Key</code> header on every request.</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com"
          className="flex-1 bg-[#0a0a14] border border-[#1a1a2e] rounded-lg px-3 py-2 text-sm text-white
                     placeholder-gray-600 focus:outline-none focus:border-violet-500/60" />
        <button type="submit" disabled={loading || !email.trim()}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
          {loading ? '…' : 'Get Key'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}

// ── Generator sub-components ───────────────────────────────────────────────

function CodeViewer({ result }: { result: ParsedResult }) {
  const [tab, setTab] = useState<Tab>('server.js');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'server.js', label: 'server.js' },
    { id: 'package.json', label: 'package.json' },
    { id: '.env.example', label: '.env.example' },
  ];
  const codeMap: Record<Tab, string> = {
    'server.js': result.serverJs,
    'package.json': result.packageJson,
    '.env.example': result.envExample,
  };
  const activeCode = codeMap[tab];
  return (
    <div className="rounded-b-xl border-x border-b border-[#1a1a2e] overflow-hidden">
      <div className="flex items-center bg-[#0a0a14] border-b border-[#1a1a2e] px-1 gap-0.5">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs font-mono font-medium transition-all duration-150 ${tab === t.id ? 'tab-active' : 'tab-inactive'}`}>
            {t.label}
          </button>
        ))}
        <div className="ml-auto pr-3"><CopyButton text={activeCode} /></div>
      </div>
      <div className="code-block max-h-[460px] overflow-y-auto">
        {activeCode || <span className="text-gray-600 italic">No content</span>}
      </div>
    </div>
  );
}

function StreamingPreview({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-[#1a1a2e] bg-[#0d1117] overflow-hidden animate-fade-in">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1a1a2e] bg-[#0a0a14]">
        <div className="flex gap-1.5">
          {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />)}
        </div>
        <span className="text-xs text-gray-500 ml-2 font-mono">generating…</span>
        <div className="ml-auto flex items-center gap-1.5">
          {[0, 0.2, 0.4].map(d => (
            <div key={d} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: `${d}s` }} />
          ))}
        </div>
      </div>
      <pre className="code-block max-h-72 overflow-y-auto text-gray-300 cursor">{text || ' '}</pre>
    </div>
  );
}

function DeployProgressSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(s + 1, DEPLOY_STEPS.length - 1)), 7000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-3">
      {DEPLOY_STEPS.map((label, i) => (
        <div key={i} className={`flex items-center gap-3 text-sm transition-colors duration-300
          ${i < step ? 'text-emerald-400' : i === step ? 'text-white' : 'text-gray-600'}`}>
          {i < step ? (
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : i === step ? (
            <div className="w-5 h-5 flex-shrink-0 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <div className="w-5 h-5 flex-shrink-0 rounded-full border border-gray-700" />
          )}
          {label}
        </div>
      ))}
    </div>
  );
}

// ── Marketplace sub-components ─────────────────────────────────────────────

function MarketplaceCard({ api }: { api: MarketplaceApi }) {
  const [expanded, setExpanded] = useState(false);
  const [tested, setTested]     = useState(false);
  const [showKey, setShowKey]   = useState(false);
  const isLive      = api.status === 'live' && !!api.railway_url;
  const isDeploying = api.status === 'deploying';

  return (
    <div className="group rounded-2xl border border-[#1a1a2e] hover:border-[#2a2a40] bg-[#0c0c18]
                    transition-all duration-200 flex flex-col">
      {/* Body */}
      <div className="p-5 flex-1 flex flex-col gap-3">
        {/* Top row: category + status */}
        <div className="flex items-center justify-between gap-2">
          <CategoryBadge category={api.category} />
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              isLive      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' :
              isDeploying ? 'bg-amber-400 animate-pulse' : 'bg-gray-600'
            }`} />
            <span className={`text-xs font-medium ${
              isLive ? 'text-emerald-400' : isDeploying ? 'text-amber-400' : 'text-gray-600'
            }`}>
              {isLive ? 'Live' : isDeploying ? 'Deploying' : 'Failed'}
            </span>
          </div>
        </div>

        {/* Name */}
        <h3 className="font-semibold text-white text-[15px] leading-snug">{api.name}</h3>

        {/* Description */}
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 flex-1">{api.description}</p>

        {/* Call count */}
        {api.free_calls_used > 0 && (
          <p className="text-xs text-gray-700">
            {api.free_calls_used.toLocaleString()} free test{api.free_calls_used !== 1 ? 's' : ''} used
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 pb-5">
        {!expanded ? (
          <button
            onClick={() => isLive && setExpanded(true)}
            disabled={!isLive}
            className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
              isLive
                ? 'bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/20 hover:border-violet-500/40'
                : isDeploying
                ? 'bg-amber-500/5 text-amber-500/40 border border-amber-500/10 cursor-not-allowed'
                : 'bg-gray-800/30 text-gray-600 border border-gray-700/30 cursor-not-allowed'
            }`}
          >
            {isLive ? 'Try Free →' : isDeploying ? '⟳ Deploying…' : '— Unavailable'}
          </button>
        ) : (
          <div className="space-y-3 pt-4 border-t border-[#1a1a2e]">
            <ApiTester apiId={api.id} defaultUrl={api.railway_url ?? ''} onTest={() => setTested(true)} />
            {tested && !showKey && (
              <button onClick={() => setShowKey(true)}
                className="w-full py-2 rounded-xl border border-violet-500/20 text-sm text-violet-400
                           hover:text-violet-300 hover:border-violet-500/40 transition-all duration-150">
                Get API Key →
              </button>
            )}
            {showKey && <KeyForm apiId={api.id} />}
          </div>
        )}
      </div>
    </div>
  );
}

function MarketplaceSection() {
  const [apis, setApis]               = useState<MarketplaceApi[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    fetch('/api/marketplace')
      .then(r => r.json())
      .then(d => setApis(d.apis ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = apis.filter(api => {
    if (activeCategory !== 'All' && api.category !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return api.name.toLowerCase().includes(q) || api.description.toLowerCase().includes(q);
    }
    return true;
  });

  const liveCount = apis.filter(a => a.status === 'live').length;

  return (
    <section className="border-t border-[#1a1a2e]" style={{ background: '#080810' }}>
      <div className="max-w-6xl mx-auto px-4 pt-16 pb-24">

        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white">API Marketplace</h2>
            <p className="text-gray-500 text-sm mt-1.5">
              {loading ? 'Loading…' : (
                liveCount > 0
                  ? `${liveCount} live API${liveCount !== 1 ? 's' : ''} ready to use`
                  : apis.length > 0
                  ? `${apis.length} API${apis.length !== 1 ? 's' : ''} — deploying now`
                  : 'No APIs yet — generate one above'
              )}
            </p>
          </div>
          {/* Search */}
          <div className="relative flex-shrink-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search APIs…"
              className="w-64 bg-[#0f0f1a] border border-[#1a1a2e] rounded-xl pl-9 pr-4 py-2.5 text-sm
                         text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500/50
                         transition-colors duration-150"
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 flex-wrap mb-8">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                activeCategory === cat
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-transparent border-[#1a1a2e] text-gray-400 hover:border-violet-500/30 hover:text-gray-200'
              }`}>
              {cat}
            </button>
          ))}
        </div>

        {/* Grid / states */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-[#1a1a2e] bg-[#0c0c18] h-52 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl border border-[#1a1a2e] bg-[#0c0c18] flex items-center justify-center mb-5">
              <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <p className="text-white font-semibold text-lg">
              {apis.length === 0 ? 'No APIs yet' : 'No results'}
            </p>
            <p className="text-gray-500 text-sm mt-1 max-w-xs leading-relaxed">
              {apis.length === 0
                ? 'Generate and deploy your first API using the builder above'
                : 'Try a different search term or category'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(api => <MarketplaceCard key={api.id} api={api} />)}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Home() {
  // Generator
  const [input, setInput]             = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [result, setResult]           = useState<ParsedResult | null>(null);
  const [error, setError]             = useState('');
  const abortRef                      = useRef<AbortController | null>(null);
  const [showCode, setShowCode]       = useState(false);

  // Deploy
  const [deployPhase, setDeployPhase] = useState<DeployPhase>('idle');
  const [deployedApi, setDeployedApi] = useState<{
    id: string; railwayUrl: string; repoUrl: string; webhookUrl: string; apiKey?: string;
  } | null>(null);
  const [deployError, setDeployError] = useState('');
  const [buildSeconds, setBuildSeconds] = useState(0);
  const [isApiLive, setIsApiLive] = useState(false);

  // Post-deploy test
  const [testedOnce, setTestedOnce]   = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────

  const generate = useCallback(async () => {
    if (!input.trim() || isGenerating) return;
    setIsGenerating(true);
    setStreamedText(''); setResult(null); setError('');
    setShowCode(false); setDeployPhase('idle');
    setDeployedApi(null); setTestedOnce(false); setShowKeyForm(false);
    abortRef.current = new AbortController();
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: input }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setStreamedText(acc);
      }
      if (acc.includes('ERROR:')) throw new Error(acc.split('ERROR:')[1].trim());
      setResult(parseResult(acc));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally { setIsGenerating(false); }
  }, [input, isGenerating]);

  const deploy = useCallback(async () => {
    if (!result) return;
    setDeployPhase('deploying'); setDeployError(''); setBuildSeconds(0);
    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverJs:    result.serverJs,
          packageJson: result.packageJson,
          envExample:  result.envExample,
          name:        resolvedName(result, input),
          description: input,
          category:    result.category || detectCategory(input),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setDeployedApi(data);

      // Poll /health every 5s up to 3 minutes (36 attempts) — proxied to avoid CORS
      setDeployPhase('building');
      setBuildSeconds(0);
      const startTime = Date.now();
      const timer = setInterval(() => setBuildSeconds(Math.floor((Date.now() - startTime) / 1000)), 1000);
      let isLive = false;
      for (let i = 0; i < 36; i++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const hRes = await fetch(`/api/healthcheck?url=${encodeURIComponent(data.railwayUrl)}`);
          const hData = await hRes.json();
          if (hData.ok) { isLive = true; break; }
        } catch { /* still building */ }
      }
      clearInterval(timer);
      setIsApiLive(isLive);
      setDeployPhase('live');
    } catch (err: unknown) {
      setDeployError(err instanceof Error ? err.message : 'Deployment failed');
      setDeployPhase('failed');
    }
  }, [result, input]);

  const reset = () => {
    abortRef.current?.abort();
    setIsGenerating(false); setStreamedText(''); setResult(null); setError('');
    setShowCode(false); setDeployPhase('idle'); setDeployedApi(null);
    setDeployError(''); setTestedOnce(false); setShowKeyForm(false); setBuildSeconds(0); setIsApiLive(false);
  };

  const name     = result ? resolvedName(result, input) : '';
  const category = result ? (result.category || detectCategory(input)) : '';

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)' }} />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — Generator
      ══════════════════════════════════════════════════════════════════ */}
      <div className="relative z-10 max-w-3xl mx-auto w-full px-4 pt-14 pb-16">

        {/* Header */}
        <header className="text-center space-y-3 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/20
                          bg-violet-500/5 text-violet-300 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Powered by Claude
          </div>
          <h1 className="text-5xl font-bold tracking-tight mt-3">
            <span className="text-white">API</span>
            <span style={{ background: 'linear-gradient(135deg,#7c3aed,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Forge
            </span>
          </h1>
          <p className="text-gray-400 text-lg max-w-md mx-auto leading-relaxed">
            Describe any API in plain English — get production-ready code deployed live in seconds.
          </p>
        </header>

        {/* ── Idle input ─────────────────────────────────────────────── */}
        {!isGenerating && !result && (
          <div className="space-y-4 animate-fade-in">
            <div className="input-glow rounded-2xl border border-[#1a1a2e] overflow-hidden" style={{ background: 'var(--card)' }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && generate()}
                placeholder="I want an API that downloads Instagram reels…"
                rows={4}
                autoFocus
                className="w-full bg-transparent text-gray-100 placeholder-gray-600 resize-none outline-none
                           px-5 py-4 text-[15px] leading-relaxed"
              />
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#1a1a2e]">
                <span className="text-xs text-gray-600">⌘ + Enter to generate</span>
                <button onClick={generate} disabled={!input.trim()}
                  className="btn-generate px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-40">
                  Generate API →
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-gray-600 px-1">Try an example:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map(ex => (
                  <button key={ex} onClick={() => setInput(ex)}
                    className="text-xs px-3 py-1.5 rounded-full border border-[#1a1a2e] text-gray-500
                               hover:text-gray-300 hover:border-violet-500/30 transition-all duration-150">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-4 text-sm flex items-start gap-3 animate-fade-in">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-medium text-red-300">Generation failed</p>
              <p className="text-red-400/80 mt-0.5">{error}</p>
              <button onClick={reset} className="mt-2 text-xs text-red-300 hover:text-red-200 underline underline-offset-2">Try again</button>
            </div>
          </div>
        )}

        {/* ── Streaming preview ──────────────────────────────────────── */}
        {isGenerating && (
          <div className="space-y-4">
            <StreamingPreview text={streamedText} />
            <button onClick={reset}
              className="text-sm text-gray-600 hover:text-gray-400 transition-colors mx-auto block">
              Cancel generation
            </button>
          </div>
        )}

        {/* ── Result ─────────────────────────────────────────────────── */}
        {result && !isGenerating && (
          <div className="space-y-4 animate-fade-in">

            {/* Top bar */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-600 mb-0.5">Generated from</p>
                <p className="text-sm text-gray-400 truncate">{input}</p>
              </div>
              <button onClick={reset}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl
                           border border-[#1a1a2e] text-gray-500 hover:text-gray-200 hover:border-[#2a2a4e] transition-all">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                </svg>
                New request
              </button>
            </div>

            {/* API card */}
            <div className="rounded-2xl border border-[#1a1a2e] bg-[#0f0f1a] p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-white">{name}</h2>
                  {result.approach && (
                    <p className="text-sm text-gray-500 mt-2 leading-relaxed">{result.approach}</p>
                  )}
                </div>
                <CategoryBadge category={category} />
              </div>
            </div>

            {/* View Code toggle */}
            <div className="rounded-2xl border border-[#1a1a2e] overflow-hidden">
              <button onClick={() => setShowCode(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-[#0a0a14]
                           text-sm text-gray-400 hover:text-gray-200 transition-colors">
                <span className="font-medium">View Code</span>
                <svg className={`w-4 h-4 transition-transform duration-200 ${showCode ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showCode && <CodeViewer result={result} />}
            </div>

            {/* ── Deploy idle ── */}
            {deployPhase === 'idle' && (
              <button onClick={deploy}
                className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm btn-generate
                           flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Deploy &amp; Test Free
              </button>
            )}

            {/* ── Deploy in progress ── */}
            {deployPhase === 'deploying' && (
              <div className="rounded-2xl border border-[#1a1a2e] bg-[#0f0f1a] p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <p className="text-sm font-semibold text-white">Deploying your API to Railway…</p>
                </div>
                <DeployProgressSteps />
                <p className="text-xs text-gray-600">Takes ~30 seconds. Your API will be live at a public URL.</p>
              </div>
            )}

            {/* ── Building phase — health polling ── */}
            {deployPhase === 'building' && deployedApi && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <p className="text-sm font-semibold text-white">
                      Waiting for Railway to build… ({buildSeconds}s)
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">up to 100s</span>
                </div>
                <a href={deployedApi.railwayUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-mono text-amber-500/60 hover:text-amber-400 transition-colors block truncate pl-6">
                  {deployedApi.railwayUrl}
                </a>
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-amber-500/40 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min((buildSeconds / 100) * 100, 100)}%` }} />
                </div>
              </div>
            )}

            {/* ── Deploy failed ── */}
            {deployPhase === 'failed' && (
              <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-5 space-y-1">
                <p className="text-red-300 font-medium text-sm">Deployment failed</p>
                <p className="text-red-400/70 text-sm">{deployError}</p>
                <button onClick={deploy}
                  className="mt-2 text-xs text-red-300 hover:text-red-200 underline underline-offset-2">
                  Retry
                </button>
              </div>
            )}

            {/* ── Deploy live ── */}
            {deployPhase === 'live' && deployedApi && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-6 space-y-5">
                {/* Status + URL */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                    <span className="text-sm font-semibold text-emerald-300">
                      {isApiLive ? 'Live 🟢' : 'Deployed — building…'}
                    </span>
                  </div>
                  <a href={deployedApi.railwayUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-emerald-500/60 hover:text-emerald-400 transition-colors block truncate pl-4">
                    {deployedApi.railwayUrl}
                  </a>
                </div>

                {/* Webhook notice */}
                <details className="group">
                  <summary className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer hover:text-gray-400
                                      transition-colors select-none list-none">
                    <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Auto-update status when Railway finishes building
                  </summary>
                  <div className="mt-3 rounded-xl border border-[#1a1a2e] bg-[#0a0a14] p-4 space-y-2.5">
                    <p className="text-xs text-gray-400">
                      Add this URL in{' '}
                      <span className="text-violet-400">Railway → Project Settings → Webhooks</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs font-mono text-gray-300 bg-black/30 rounded-lg px-3 py-2 truncate">
                        {deployedApi.webhookUrl}
                      </code>
                      <button onClick={() => navigator.clipboard.writeText(deployedApi.webhookUrl)}
                        className="flex-shrink-0 px-3 py-2 text-xs bg-white/5 hover:bg-white/10
                                   border border-white/5 rounded-lg text-gray-400 hover:text-gray-200 transition-colors">
                        Copy
                      </button>
                    </div>
                  </div>
                </details>

                {/* Divider */}
                <div className="border-t border-emerald-500/10" />

                {/* Test form — only show once API is confirmed live */}
                {!isApiLive ? (
                  <div className="flex items-center gap-2 text-xs text-amber-400/80">
                    <div className="w-3 h-3 border border-amber-400/60 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    API is still starting up on Railway — check back in a minute, then refresh the page.
                  </div>
                ) : !testedOnce ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400 font-medium">Test your API (1 free call included):</p>
                    <ApiTester apiId={deployedApi.id} defaultUrl={deployedApi.railwayUrl} onTest={() => setTestedOnce(true)} />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-300">Free test used. Get a key for continued access:</p>
                    {!showKeyForm
                      ? <button onClick={() => setShowKeyForm(true)}
                          className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white
                                     text-sm font-medium transition-colors">
                          Get API Key →
                        </button>
                      : <KeyForm apiId={deployedApi.id} />
                    }
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — Marketplace
      ══════════════════════════════════════════════════════════════════ */}
      <MarketplaceSection />
    </div>
  );
}
