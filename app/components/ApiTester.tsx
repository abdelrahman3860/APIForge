'use client';
import { useState } from 'react';

type Props = {
  defaultUrl?: string;
  apiId?: string;   // when provided, routes through /api/test for IP tracking + key enforcement
  onTest?: () => void;
};

type Status = 'idle' | 'ok' | 'error' | 'needs_key';

export default function ApiTester({ defaultUrl = '', apiId, onTest }: Props) {
  const [url, setUrl] = useState(defaultUrl);
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  async function testApi() {
    const base = (apiId ? url || defaultUrl : url).replace(/\/$/, '');
    if (!base && !apiId) return;
    setLoading(true);
    setStatus('idle');
    setResponse('');

    try {
      if (apiId) {
        // ── Tracked call through proxy ───────────────────────────────────
        const res = await fetch('/api/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiId,
            railwayUrl: base,
            ...(apiKey ? { apiKey } : {}),
          }),
        });

        if (res.status === 402) {
          setStatus('needs_key');
          return;
        }

        const json = await res.json().catch(() => null);
        const prettyResponse = JSON.stringify(json?.data ?? json, null, 2);
        setResponse(prettyResponse !== 'null' ? prettyResponse : '');
        setStatus(res.ok && json?.ok !== false ? 'ok' : 'error');
        if (res.ok && json?.ok !== false) onTest?.();
      } else {
        // ── Direct call (no tracking, no apiId) ──────────────────────────
        let ok = false;
        try {
          const res = await fetch(base + '/health');
          ok = res.ok;
        } catch {
          const res = await fetch(base);
          ok = res.ok;
        }
        setStatus(ok ? 'ok' : 'error');
        if (ok) onTest?.();
      }
    } catch {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }

  const showUrlInput = !apiId;
  const buttonLabel = loading ? 'Testing…' : status === 'needs_key' ? 'Test with Key' : 'Test API';

  return (
    <div className="space-y-2">
      {showUrlInput && (
        <input
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
                     placeholder-gray-600 focus:outline-none focus:border-purple-500"
          placeholder="https://your-api.up.railway.app"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && testApi()}
        />
      )}

      {status === 'needs_key' && (
        <div className="space-y-1.5">
          <p className="text-xs text-amber-400">Free test used — enter your API key to continue:</p>
          <input
            className="w-full bg-gray-900 border border-amber-500/30 rounded-lg px-3 py-2 text-sm text-white
                       placeholder-gray-600 focus:outline-none focus:border-amber-500"
            placeholder="ak_…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && testApi()}
            autoFocus
          />
        </div>
      )}

      <button
        onClick={testApi}
        disabled={loading || (!url.trim() && !apiId)}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white
                   text-sm font-medium py-2 rounded-lg transition-colors"
      >
        {buttonLabel}
      </button>

      {status === 'ok'    && <p className="text-sm text-green-400">✅ API is working</p>}
      {status === 'error' && <p className="text-sm text-red-400">❌ API not responding</p>}

      {response && (
        <pre className="text-xs text-gray-300 bg-gray-900 border border-gray-800 rounded-lg p-3
                        overflow-auto max-h-32 font-mono leading-relaxed">{response}</pre>
      )}
    </div>
  );
}
