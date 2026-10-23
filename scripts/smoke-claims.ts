// Sandbox smoke test for claim-check: mocked Gemini. Run: npx tsx scripts/smoke-claims.ts
import { run } from '../api/claim-check';
import sample from '../src/fixtures/sample-review.json';
import { computeReview } from '../src/shared/score';

process.env.GEMINI_API_KEY = 'test';
const body = { claims: [
  { source: 'readme', quote: 'Export your ledger to PDF.', status: 'contradicted', note: 'export always throws', evidence: [{ type: 'quote', source: 'src/lib/export.ts', quote: "throw new Error('not implemented')" }] },
  { source: 'devpost', quote: 'Built for developers who want to ship faster.', status: 'unsupported', note: '', evidence: [] },               // no note -> unverifiable
  { source: 'readme', quote: 'Runs on Kubernetes with autoscaling.', status: 'unsupported', note: 'checked', evidence: [] },                     // not in any source -> dropped
  { source: 'readme', quote: 'Ledgerlight is a sample project.', status: 'contradicted', note: 'seems wrong somehow', evidence: [{ type: 'quote', source: 'README.md', quote: 'made up evidence line' }] }, // fake evidence -> unsupported
  { source: 'readme', quote: 'Built for developers who want to ship faster.', status: 'supported', note: '', evidence: [{ type: 'region', ref: 'R1' }] }, // region ref resolves; supported kept
] };
globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }), { status: 200 })) as typeof fetch;

(async () => {
  const s = sample as any;
  const res = await run({ devpostText: 'Built for developers who want to ship faster.', readme: s.readme, description: s.description, repo: s.repo, ui: s.ui });
  for (const c of res.claims) console.log(c.id, c.status.padEnd(12), `-${c.pointsLost}`, c.source, '|', c.text, '| evidence:', c.evidence.map((e) => e.kind).join(','));
  const sc = computeReview(66, 62, res.claims);
  console.log('score', sc);
  console.log('no sources ->', await run({ readme: '', description: null, repo: s.repo, ui: s.ui } as any));
})().catch((e) => { console.error('FAILED', e.code ?? '', e.message); process.exit(1); });
