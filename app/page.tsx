'use client';

import { useState, useRef, useCallback } from 'react';
import ApiTester from './components/ApiTester';

// ── Types ──────────────────────────────────────────────────────────────────

type ParsedResult = {
  approach: string;
  serverJs: string;
  packageJson: string;
  envExample: string;
  deploy: string;
};

type Tab = 'server.js' | 'package.json' | '.env.example';

// ── Helpers ────────────────────────────────────────────────────────────────

function extract(text: string, open: string, close: string): string {
  const s = text.indexOf(open);
  const e = text.indexOf(close);
  if (s === -1 || e === -1) return '';
  return text.slice(s + open.length, e).trim();
}

function parseResult(raw: string): ParsedResult {
  return {
    approach: extract(raw, '===APPROACH===', '===END_APPROACH==='),
    serverJs: extract(raw, '===SERVER_JS===', '===END_SERVER_JS==='),
    packageJson: extract(raw, '===PACKAGE_JSON===', '===END_PACKAGE_JSON==='),
    envExample: extract(raw, '===ENV_EXAMPLE===', '===END_ENV_EXAMPLE==='),
    deploy: extract(raw, '===DEPLOY===', '===END_DEPLOY==='),
  };
}

function isComplete(raw: string): boolean {
  return raw.includes('===END_DEPLOY===');
}

const EXAMPLES = [
  'I want an API that converts YouTube videos to MP3',
  'Build me an API that generates QR codes from any URL',
  'I need an API that sends SMS notifications via Twilio',
  'Create an API that scrapes product prices from Amazon',
  'I want an API that translates text between any languages',
  'Build me an API that generates PDF invoices from JSON data',
];

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

function ApproachCard({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-5 animate-slide-up">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center">
          <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <span className="text-sm font-medium text-violet-300">Approach</span>
      </div>
      <p className="text-gray-300 text-sm leading-relaxed">{text}</p>
    </div>
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
    <div className="rounded-xl border border-[#1a1a2e] overflow-hidden animate-slide-up" style={{ animationDelay: '0.1s' }}>
      {/* Tab bar */}
      <div className="flex items-center bg-[#0a0a14] border-b border-[#1a1a2e] px-1 gap-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-xs font-mono font-medium transition-all duration-150 ${
              tab === t.id ? 'tab-active' : 'tab-inactive'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto pr-3">
          <CopyButton text={activeCode} />
        </div>
      </div>

      {/* Code */}
      <div className="code-block max-h-[520px] overflow-y-auto">
        {activeCode || <span className="text-gray-600 italic">No content</span>}
      </div>
    </div>
  );
}

function DeployCard({ text }: { text: string }) {
  // Extract just the commands (lines starting with non-#)
  const commands = text
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .join('\n');

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 overflow-hidden animate-slide-up" style={{ animationDelay: '0.2s' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-500/15">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
          <span className="text-sm font-medium text-emerald-300">Deploy to Railway</span>
        </div>
        <CopyButton text={commands} label="Copy commands" />
      </div>
      <div className="code-block max-h-48 text-emerald-100/90" style={{ borderRadius: 0 }}>
        {text}
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
          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse [animation-delay:0.2s]" />
          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse [animation-delay:0.4s]" />
        </div>
      </div>
      <pre className="code-block max-h-72 overflow-y-auto text-gray-300 cursor">
        {text || ' '}
      </pre>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Home() {
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [result, setResult] = useState<ParsedResult | null>(null);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async () => {
    if (!input.trim() || isGenerating) return;

    setIsGenerating(true);
    setStreamedText('');
    setResult(null);
    setError('');

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: input }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setStreamedText(accumulated);
      }

      if (accumulated.includes('ERROR:')) {
        throw new Error(accumulated.split('ERROR:')[1].trim());
      }

      if (isComplete(accumulated)) {
        setResult(parseResult(accumulated));
      } else {
        // Partial response — still show what we have
        setResult(parseResult(accumulated));
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [input, isGenerating]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generate();
  };

  const reset = () => {
    abortRef.current?.abort();
    setIsGenerating(false);
    setStreamedText('');
    setResult(null);
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[50%] translate-x-[-50%] w-[800px] h-[600px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)' }} />
      </div>

      <div className="relative z-10 flex flex-col flex-1 max-w-3xl mx-auto w-full px-4 py-12 gap-8">

        {/* Header */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/20 bg-violet-500/5 text-violet-300 text-xs font-medium mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Powered by Claude
          </div>
          <h1 className="text-5xl font-bold tracking-tight">
            <span className="text-white">API</span>
            <span style={{
              background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Forge</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-lg mx-auto leading-relaxed">
            Describe any API in plain English. Get production-ready Express code in seconds.
          </p>
        </header>

        {/* Input */}
        {!isGenerating && !result && (
          <div className="space-y-3 animate-fade-in">
            <div
              className="input-glow rounded-xl border border-[#1a1a2e] overflow-hidden"
              style={{ background: 'var(--card)' }}
            >
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
                <button
                  onClick={generate}
                  disabled={!input.trim()}
                  className="btn-generate px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40"
                >
                  Generate API →
                </button>
              </div>
            </div>

            {/* Example prompts */}
            <div className="space-y-2">
              <p className="text-xs text-gray-600 px-1">Try an example:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setInput(ex)}
                    className="text-xs px-3 py-1.5 rounded-full border border-[#1a1a2e] text-gray-500 hover:text-gray-300 hover:border-violet-500/30 transition-all duration-150"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4 text-red-300 text-sm animate-fade-in flex items-start gap-3">
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
            <button
              onClick={reset}
              className="text-sm text-gray-600 hover:text-gray-400 transition-colors mx-auto block"
            >
              Cancel generation
            </button>
          </div>
        )}

        {/* Results */}
        {result && !isGenerating && (
          <div className="space-y-4 animate-fade-in">
            {/* Back button + request recap */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-600 mb-1">Request</p>
                <p className="text-sm text-gray-300 truncate">{input}</p>
              </div>
              <button
                onClick={reset}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[#1a1a2e] text-gray-500 hover:text-gray-300 hover:border-[#2a2a4e] transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                </svg>
                New request
              </button>
            </div>

            {result.approach && <ApproachCard text={result.approach} />}

            {(result.serverJs || result.packageJson || result.envExample) && (
              <CodeViewer result={result} />
            )}

            {result.serverJs && <ApiTester serverJs={result.serverJs} />}

            {result.deploy && <DeployCard text={result.deploy} />}
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-gray-700 mt-auto pt-8">
          APIForge · Built with Next.js 14 + Claude
        </footer>
      </div>
    </div>
  );
}
