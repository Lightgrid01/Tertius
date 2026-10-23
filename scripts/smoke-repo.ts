// Sandbox smoke test: canned GitHub + mocked Gemini (the sandbox can't call GitHub unauthenticated). Run: npx tsx scripts/smoke-repo.ts
import { run as checkInputs } from '../api/check-inputs';
import { run as judgeRepo } from '../api/judge-repo';

process.env.GEMINI_API_KEY = 'test';
const realFetch = globalThis.fetch;
let geminiCalls = 0;
globalThis.fetch = (async (url: any, init?: any) => {
  if (String(url).includes('generativelanguage.googleapis.com')) {
    geminiCalls++;
    const part = (key: string, points: number, quote: string) => ({ key, points, advice: `Fix ${key}`, why: 'because', evidence: [{ source: 'README', quote }] });
    const body = { parts: [part('structure', 20, 'this quote was invented by the model'), part('functionality', 15, 'Hello World!')], evidenceLines: ['one', 'two'] };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(body) + '\n```' }] } }] }), { status: 200 });
  }
  const u = String(url);
  const b64 = (t: string) => Buffer.from(t).toString('base64');
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
  const files: Record<string, string> = { 'package.json': '{"scripts":{"test":"vitest"}}', 'src/main.ts': 'throw new Error("not implemented") // TODO' , '.env': 'K=1' };
  if (u.endsWith('/repos/octocat/Hello-World')) return json({ description: 'My first repo', default_branch: 'main', private: false, archived: false });
  if (u.includes('/repos/octocat/definitely-not')) return json({ message: 'Not Found' }, 404);
  if (u.endsWith('/readme')) return json({ path: 'README.md', encoding: 'base64', content: b64('Hello World!\nRun npm install.') });
  if (u.includes('/git/trees/')) return json({ truncated: false, tree: Object.keys(files).map((p) => ({ path: p, type: 'blob', size: files[p].length })) });
  if (u.includes('/commits')) return json([{ commit: { author: { date: '2026-10-01T10:00:00Z' }, committer: null, message: 'init' } }, { commit: { author: { date: '2026-10-03T10:00:00Z' }, committer: null, message: 'more' } }]);
  const m = u.match(/\/contents\/([^?]+)/);
  if (m && files[decodeURIComponent(m[1])]) return json({ type: 'file', encoding: 'base64', content: b64(files[decodeURIComponent(m[1])]) });
  return json({}, 404);
}) as typeof fetch;

(async () => {
  const c = await checkInputs({ repoUrl: 'https://github.com/octocat/Hello-World', devpost: 'A pasted description of the project.' });
  console.log('check-inputs:', c);
  const bad = await checkInputs({ repoUrl: 'https://github.com/octocat/definitely-not-a-real-repo-xyz' }).catch((e) => `${e.code}: ${e.message}`);
  console.log('missing repo ->', bad);
  const r = await judgeRepo({ owner: c.owner, repo: c.repo, defaultBranch: c.defaultBranch, description: c.description });
  console.log('score', r.result.score, 'files', r.result.filesRead, 'gemini calls', geminiCalls);
  for (const p of r.result.parts) console.log(p.key, p.points + '/' + p.max, p.evidence.map((e) => e.kind === 'quote' ? `q:${e.quote}` : e.kind === 'metric' ? `m:${e.name}=${e.value}` : 'region').join(' | '));
})().catch((e) => { console.error('FAILED', e.code ?? '', e.message); process.exit(1); });
