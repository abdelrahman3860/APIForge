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
type DeployPhase = 'idle' | 'deploying' | 'live' | 'failed';

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
  return text.slice(s + open.length, e).trim();
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

function isComplete(raw: string): boolean {
  return raw.includes('===END_DEPLOY===');
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

function apiName(result: ParsedResult, input: string): string {
  if (result.name) return result.name;
  return input
    .replace(/^(i want|build me|create|i need|make|give me)\s+an?\s+api\s+(that\s+)?/i, '')
    .replace(/^(i want|build me|create|i need|make)\s+/i, '')
    .split(/\s+/).slice(0, 6).join(' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all duration-150
                 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 border border-white/5"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-400">Copied!</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.Utility;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {category || 'Utility'}
    </span>
  );
}

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
    <div className="rounded-xl border border-[#1a1a2e] overflow-hidden">
      <div className="flex items-center bg-[#0a0a14] border-b border-[#1a1a2e] px-1 gap-0.5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-xs font-mono font-medium transition-all duration-150 ${tab === t.id ? 'tab-active' : 'tab-inactive'}`}>
            {t.label}
          </button>
        ))}
        <div className="ml-auto pr-3"><CopyButton text={activeCode} /></div>
      </div>
      <div className="code-block max-h-[480px] overflow-y-auto">
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
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="text-xs text-gray-500 ml-2 font-mono">generating…</span>
        <div className="ml-auto flex items-center gap-1.5">
          {[0, 0.2, 0.4].map((d) => (
            <div key={d} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"
              style={{ animationDelay: `${d}s` }} />
          ))}
        </div>
      </div>
      <pre className="code-block max-h-72 overflow-y-auto text-gray-300 cursor">
        {text || ' '}
      </pre>
    </div>
  );
}

function DeployProgressSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, DEPLOY_STEPS.length - 1)), 7000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-2">
      {DEPLOY_STEPS.map((label, i) => (
        <div key={i} className={`flex items-center gap-2 text-sm transition-colors ${i < step ? 'text-green-400' : i === step ? 'text-white' : 'text-gray-600'}`}>
          {i < step ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : i === step ? (
            <div className="w-4 h-4 flex-shrink-0 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <div className="w-4 h-4 flex-shrink-0 rounded-full border border-gray-700" />
          )}
          {label}
        </div>
      ))}
    </div>
  );
}

function KeyForm({ apiId }: { apiId?: string }) {
  const [email, setEmail] = useState('');
  const [key, setKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !apiId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, apiId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setKey(data.key);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate key');
    } finally {
      setLoading(false);
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (key) {
    return (
      <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-4 space-y-2">
        <p className="text-xs text-violet-300 font-medium">Your API key (10 free calls):</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono text-white bg-black/30 rounded px-3 py-2 truncate">
            {key}
          </code>
          <button
            onClick={copyKey}
            className="flex-shrink-0 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs
                       rounded-lg transition-colors font-medium"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-gray-500">Send this as the <code className="font-mono">X-API-Key</code> header with each request.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
                     placeholder-gray-600 focus:outline-none focus:border-purple-500"
        />
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white
                     text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? '…' : 'Get Key'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}

// Marketplace card — shown in the grid section
function MarketplaceCard({ api }: { api: MarketplaceApi }) {
  const [expanded, setExpanded] = useState(false);
  const [tested, setTested] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const isLive = api.status === 'live' && !!api.railway_url;

  return (
    <div className="rounded-xl border border-[#1a1a2e] bg-[#0f0f1a] p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-white text-sm leading-snug">{api.name}</h3>
        <CategoryBadge category={api.category} />
      </div>
      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{api.description}</p>

      {!expanded ? (
        <button
          onClick={() => isLive && setExpanded(true)}
          className={`mt-auto text-sm font-medium transition-colors text-left ${
            isLive
              ? 'text-violet-400 hover:text-violet-300'
              : api.status === 'deploying'
              ? 'text-amber-400/60 cursor-default'
              : 'text-gray-600 cursor-default'
          }`}
        >
          {isLive ? 'Try Free →' : api.status === 'deploying' ? '⟳ Deploying…' : '— Unavailable'}
        </button>
      ) : (
        <div className="space-y-3 border-t border-[#1a1a2e] pt-3">
          <ApiTester
            apiId={api.id}
            defaultUrl={api.railway_url ?? ''}
            onTest={() => setTested(true)}
          />
          {tested && !showKey && (
            <button
              onClick={() => setShowKey(true)}
              className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
            >
              Get API Key →
            </button>
          )}
          {showKey && <KeyForm apiId={api.id} />}
        </div>
      )}
    </div>
  );
}

function MarketplaceSection() {
  const [apis, setApis] = useState<MarketplaceApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    fetch('/api/marketplace')
      .then((r) => r.json())
      .then((d) => setApis(d.apis ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = apis.filter((api) => {
    if (activeCategory !== 'All' && api.category !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return api.name.toLowerCase().includes(q) || api.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <section className="border-t border-[#1a1a2e] mt-20 pt-16 pb-20">
      <div className="max-w-6xl mx-auto px-4">
        {/* Heading */}
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">API Marketplace</h2>
            <p className="text-sm text-gray-500 mt-1">
              {loading ? 'Loading…' : `${apis.length} API${apis.length !== 1 ? 's' : ''} available`}
            </p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search APIs…"
            className="w-56 bg-[#0f0f1a] border border-[#1a1a2e] rounded-lg px-3 py-2 text-sm
                       text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
          />
        </div>

        {/* Category filters */}
        <div className="flex gap-2 flex-wrap mb-8">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${
                activeCategory === cat
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-transparent border-[#1a1a2e] text-gray-400 hover:border-violet-500/40 hover:text-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl border border-[#1a1a2e] bg-[#0f0f1a] p-5 h-36 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🔌</div>
            <p className="text-gray-400 font-medium">
              {apis.length === 0 ? 'No APIs deployed yet' : 'No APIs match your search'}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {apis.length === 0
                ? 'Generate and deploy your first API above'
                : 'Try a different search or category'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((api) => (
              <MarketplaceCard key={api.id} api={api} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Home() {
  // Generator state
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [result, setResult] = useState<ParsedResult | null>(null);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Code visibility toggle
  const [showCode, setShowCode] = useState(false);

  // Deploy state
  const [deployPhase, setDeployPhase] = useState<DeployPhase>('idle');
  const [deployedApi, setDeployedApi] = useState<{ id: string; railwayUrl: string; repoUrl: string } | null>(null);
  const [deployError, setDeployError] = useState('');

  // Post-deploy test state
  const [testedOnce, setTestedOnce] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);

  // ── Generate ──────────────────────────────────────────────────────────────

  const generate = useCallback(async () => {
    if (!input.trim() || isGenerating) return;
    setIsGenerating(true);
    setStreamedText('');
    setResult(null);
    setError('');
    setShowCode(false);
    setDeployPhase('idle');
    setDeployedApi(null);
    setTestedOnce(false);
    setShowKeyForm(false);
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: input }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');
      const decoder = new TextDecoder();
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setStreamedText(accumulated);
      }
      if (accumulated.includes('ERROR:')) throw new Error(accumulated.split('ERROR:')[1].trim());
      setResult(parseResult(accumulated));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [input, isGenerating]);

  // ── Deploy ────────────────────────────────────────────────────────────────

  const deploy = useCallback(async () => {
    if (!result) return;
    setDeployPhase('deploying');
    setDeployError('');
    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverJs:    result.serverJs,
          packageJson: result.packageJson,
          envExample:  result.envExample,
          name:        apiName(result, input),
          description: input,
          category:    result.category || detectCategory(input),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setDeployedApi(data);
      setDeployPhase('live');
    } catch (err: unknown) {
      setDeployError(err instanceof Error ? err.message : 'Deployment failed');
      setDeployPhase('failed');
    }
  }, [result, input]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = () => {
    abortRef.current?.abort();
    setIsGenerating(false);
    setStreamedText('');
    setResult(null);
    setError('');
    setShowCode(false);
    setDeployPhase('idle');
    setDeployedApi(null);
    setDeployError('');
    setTestedOnce(false);
    setShowKeyForm(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generate();
  };

  const name = result ? apiName(result, input) : '';
  const category = result ? (result.category || detectCategory(input)) : '';

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[50%] translate-x-[-50%] w-[800px] h-[600px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)' }} />
      </div>

      {/* ── Generator Section ───────────────────────────────────────────── */}
      <div className="relative z-10 max-w-3xl mx-auto w-full px-4 pt-12 pb-8">

        {/* Header */}
        <header className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/20
                          bg-violet-500/5 text-violet-300 text-xs font-medium mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Powered by Claude
          </div>
          <h1 className="text-5xl font-bold tracking-tight">
            <span className="text-white">API</span>
            <span style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Forge
            </span>
          </h1>
          <p className="text-gray-400 text-lg max-w-lg mx-auto leading-relaxed">
            Describe any API in plain English. Get production-ready code, deployed live in seconds.
          </p>
        </header>

        {/* Input (only when idle) */}
        {!isGenerating && !result && (
          <div className="space-y-3 animate-fade-in">
            <div className="input-glow rounded-xl border border-[#1a1a2e] overflow-hidden" style={{ background: 'var(--card)' }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="I want an API that downloads Instagram reels…"
                rows={4}
                className="w-full bg-transparent text-gray-100 placeholder-gray-600 resize-none outline-none px-5 py-4 text-[15px] leading-relaxed"
                autoFocus
              />
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#1a1a2e]">
                <span className="text-xs text-gray-600">⌘ + Enter to generate</span>
                <button onClick={generate} disabled={!input.trim()}
                  className="btn-generate px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40">
                  Generate API →
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gray-600 px-1">Try an example:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
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

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4 text-sm animate-fade-in flex items-start gap-3">
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

        {/* Streaming preview */}
        {isGenerating && (
          <div className="space-y-4">
            <StreamingPreview text={streamedText} />
            <button onClick={reset} className="text-sm text-gray-600 hover:text-gray-400 transition-colors mx-auto block">
              Cancel generation
            </button>
          </div>
        )}

        {/* Result */}
        {result && !isGenerating && (
          <div className="space-y-4 animate-fade-in">
            {/* Top bar: request recap + new request */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-600 mb-1">Request</p>
                <p className="text-sm text-gray-300 truncate">{input}</p>
              </div>
              <button onClick={reset}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg
                           border border-[#1a1a2e] text-gray-500 hover:text-gray-300 hover:border-[#2a2a4e] transition-all">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                </svg>
                New request
              </button>
            </div>

            {/* API info card */}
            <div className="rounded-xl border border-[#1a1a2e] bg-[#0f0f1a] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-white">{name}</h2>
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">{result.approach || input}</p>
                </div>
                <CategoryBadge category={category} />
              </div>
            </div>

            {/* View code toggle */}
            <div className="rounded-xl border border-[#1a1a2e] overflow-hidden">
              <button
                onClick={() => setShowCode((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0a0a14]
                           text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                <span className="font-medium">View Code</span>
                <svg className={`w-4 h-4 transition-transform duration-200 ${showCode ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showCode && <CodeViewer result={result} />}
            </div>

            {/* Deploy section */}
            {deployPhase === 'idle' && (
              <button onClick={deploy}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all duration-150
                           btn-generate flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Deploy &amp; Test Free
              </button>
            )}

            {deployPhase === 'deploying' && (
              <div className="rounded-xl border border-[#1a1a2e] bg-[#0f0f1a] p-5 space-y-4">
                <p className="text-sm font-medium text-white">Deploying your API…</p>
                <DeployProgressSteps />
                <p className="text-xs text-gray-600">This takes about 30 seconds. Hang tight.</p>
              </div>
            )}

            {deployPhase === 'failed' && (
              <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4 text-sm">
                <p className="text-red-300 font-medium">Deployment failed</p>
                <p className="text-red-400/80 mt-0.5">{deployError}</p>
                <button onClick={deploy} className="mt-2 text-xs text-red-300 hover:text-red-200 underline underline-offset-2">
                  Retry
                </button>
              </div>
            )}

            {deployPhase === 'live' && deployedApi && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                  <span className="text-sm font-medium text-emerald-300">Live!</span>
                  <a href={deployedApi.railwayUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-emerald-400/70 hover:text-emerald-300 font-mono truncate transition-colors">
                    {deployedApi.railwayUrl}
                  </a>
                </div>

                {!testedOnce ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">Test your live API (1 free call included):</p>
                    <ApiTester
                      apiId={deployedApi.id}
                      defaultUrl={deployedApi.railwayUrl}
                      onTest={() => setTestedOnce(true)}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-300">Free test used. Get an API key for continued access:</p>
                    {!showKeyForm ? (
                      <button onClick={() => setShowKeyForm(true)}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm
                                   font-medium rounded-lg transition-colors">
                        Get API Key →
                      </button>
                    ) : (
                      <KeyForm apiId={deployedApi.id} />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Marketplace Section ─────────────────────────────────────────── */}
      <MarketplaceSection />
    </div>
  );
}
