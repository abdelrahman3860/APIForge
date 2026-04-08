'use client';
import { useState } from 'react';

export default function ApiTester() {
  const [baseUrl, setBaseUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [loading, setLoading] = useState(false);

  async function testApi() {
    const url = baseUrl.replace(/\/$/, '');
    if (!url) return;
    setLoading(true);
    setStatus('idle');
    try {
      const res = await fetch(url + '/health').catch(() => fetch(url + '/'));
      setStatus(res.ok ? 'ok' : 'error');
    } catch {
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-purple-400">Test API</h2>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Deployed API URL</label>
        <input
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
          placeholder="https://your-api.up.railway.app"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && testApi()}
        />
      </div>
      <button
        onClick={testApi}
        disabled={loading || !baseUrl.trim()}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
      >
        {loading ? 'Testing…' : 'Test API'}
      </button>
      {status === 'ok' && (
        <p className="text-sm text-green-400">✅ API is working</p>
      )}
      {status === 'error' && (
        <p className="text-sm text-red-400">❌ API not responding</p>
      )}
    </div>
  );
}
