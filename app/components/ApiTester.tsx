'use client';
import { useState } from 'react';

function parseRoutes(serverJs: string) {
  const routes: { method: string; path: string; description: string }[] = [];
  const regex = /app\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/gi;
  let match;
  while ((match = regex.exec(serverJs)) !== null) {
    const path = match[2];
    if (path === '*') continue;
    routes.push({
      method: match[1].toUpperCase(),
      path,
      description: path === '/' || path === '/health' ? 'Health check' : `${match[1].toUpperCase()} ${path}`,
    });
  }
  return routes;
}

export default function ApiTester({ serverJs }: { serverJs: string }) {
  const routes = parseRoutes(serverJs);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [selectedRoute, setSelectedRoute] = useState(routes[0] || null);
  const [body, setBody] = useState('{}');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  if (!routes.length) return null;

  async function tryIt() {
    if (!baseUrl) { setResponse('⚠️ Enter your deployed API URL first'); return; }
    setLoading(true);
    setResponse('');
    try {
      const url = baseUrl.replace(/\/$/, '') + selectedRoute!.path;
      const isGet = selectedRoute!.method === 'GET';
      const res = await fetch(url, {
        method: selectedRoute!.method,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        ...(isGet ? {} : { body }),
      });
      const text = await res.text();
      try { setResponse(JSON.stringify(JSON.parse(text), null, 2)); }
      catch { setResponse(text); }
    } catch (e: any) {
      setResponse('❌ ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950 p-5">
      <h2 className="text-sm font-semibold text-purple-400 mb-4">🧪 Try Your API</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Your deployed API URL</label>
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
            placeholder="https://your-api.up.railway.app"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">API Key (X-API-Key)</label>
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
            placeholder="your_secret_api_key"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Endpoint</label>
          <div className="flex gap-2 flex-wrap">
            {routes.map((r, i) => (
              <button
                key={i}
                onClick={() => setSelectedRoute(r)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  selectedRoute?.path === r.path && selectedRoute?.method === r.method
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-purple-500'
                }`}
              >
                <span className="font-mono">{r.method}</span> {r.path}
              </button>
            ))}
          </div>
        </div>
        {selectedRoute?.method !== 'GET' && (
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Request Body (JSON)</label>
            <textarea
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-purple-500 h-24 resize-none"
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>
        )}
        <button
          onClick={tryIt}
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
        >
          {loading ? 'Sending...' : '▶ Try it'}
        </button>
        {response && (
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Response</label>
            <pre className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-green-400 overflow-auto max-h-48 whitespace-pre-wrap">{response}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
