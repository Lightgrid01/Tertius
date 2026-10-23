// Sandbox smoke test for judge-ui: mocked PageSpeed + Gemini. Run: npx tsx scripts/smoke-ui.ts
import { run } from '../api/judge-ui';

process.env.GEMINI_API_KEY = 'test';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
let mode: 'ok' | 'down' | 'mobile-down' = 'ok';
const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
globalThis.fetch = (async (url: any) => {
  const u = String(url);
  if (u.includes('pagespeedonline')) {
    const strat = new URL(u).searchParams.get('strategy');
    if (mode === 'down' || (mode === 'mobile-down' && strat === 'mobile')) return j({ lighthouseResult: { runtimeError: { code: 'FAILED_DOCUMENT_REQUEST', message: 'x' } } });
    return j({ lighthouseResult: { categories: { performance: { score: 0.74 }, accessibility: { score: 0.82 }, 'best-practices': { score: 0.9 } }, audits: { 'final-screenshot': { details: { data: PNG } }, 'largest-contentful-paint': { displayValue: '3.4\u00a0s' } } } });
  }
  const body = {
    parts: [
      { key: 'distinct', points: 18, advice: 'Pick one visual idea', why: 'generic', evidence: [{ type: 'region', screenshot: 'desktop', box: [100, 50, 400, 600], note: 'hero block' }] },
      { key: 'first', points: 12, advice: 'Show the action', why: 'below fold', evidence: [{ type: 'region', screenshot: 'desktop', box: [900, 900, 1200, 1000], note: 'outside the image' }, { type: 'metric', metric: 'mobile.lcp' }, { type: 'metric', metric: 'made.up' }] },
      { key: 'flow', points: 16, advice: '', why: '', evidence: [] },
      { key: 'states', points: 5, advice: '', why: '', evidence: [] },
      { key: 'responsive', points: 7, advice: 'Raise contrast', why: 'low', evidence: [{ type: 'metric', metric: 'mobile.accessibility' }] },
    ],
    evidenceLines: ['a', 'b'], observedSummary: 'A hero and a button.',
  };
  return j({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] });
}) as typeof fetch;

(async () => {
  const r = await run({ liveUrl: 'example.com' });
  console.log('score', r.result.score, '(observed max 85: (18+12+16+7)/85*100 = 62.4 -> 62; states 5/15 without a region is dropped to null)');
  for (const p of r.result.parts) console.log(p.key, p.points, p.evidence.map((e) => e.kind === 'region' ? `region ${e.screenshot} ${e.box.map((n) => +n.toFixed(2))}` : e.kind === 'metric' ? `metric ${e.name}=${e.value}` : 'quote').join(' | '));
  mode = 'down';
  console.log('down ->', await run({ liveUrl: 'example.com' }).catch((e) => `${e.code}: ${e.message}`));
  mode = 'mobile-down';
  const half = await run({ liveUrl: 'example.com' });
  console.log('mobile-down -> still scores', half.result.score);
  console.log('bad url ->', await run({ liveUrl: 'localhost' }).catch((e) => `${e.code}: ${e.message}`));
})().catch((e) => { console.error('FAILED', e.code ?? '', e.message); process.exit(1); });
