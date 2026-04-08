'use client';
import { useState } from 'react';

type Props = {
  defaultUrl?: string;
  onTest?: () => void;
};

export default function ApiTester({ defaultUrl = '', onTest }: Props) {
  const [url, setUrl] = useState(defaultUrl);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [loading, setLoading] = useState(false);

  async function testApi() {
    const base = url.replace(/\/$/, '');
    if (!base) return;
    setLoading(true);
    setStatus('idle');
    try {
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
    } catch {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
        placeholder="https://your-api.up.railway.app"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && testApi()}
      />
      <button
        onClick={testApi}
        disabled={loading || !url.trim()}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg transition-colors"
      >
        {loading ? 'Testing…' : 'Test API'}
      </button>
      {status === 'ok' && <p className="text-sm text-green-400">✅ API is working</p>}
      {status === 'error' && <p className="text-sm text-red-400">❌ API not responding</p>}
    </div>
  );
}
