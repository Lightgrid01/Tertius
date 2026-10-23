// Day-1 check for YOUR free key: which models work, and how fast it rate-limits.
// Run: npm run measure   (needs GEMINI_API_KEY in .env.local, Node 20.6+)
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY is not set in .env.local'); process.exit(1); }

const CANDIDATES = [...new Set([process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'].filter(Boolean) as string[])];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const call = async (model: string) => {
  const t = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }], generationConfig: { maxOutputTokens: 64 } }),
  });
  let detail = '';
  if (!res.ok) { try { detail = ((await res.json()) as any)?.error?.message?.slice(0, 140) ?? ''; } catch { /* ignore */ } }
  return { status: res.status, ms: Date.now() - t, detail };
};

(async () => {
  console.log('Step 1: which models answer on your key?\n');
  const working: string[] = [];
  for (const m of CANDIDATES) {
    const r = await call(m);
    console.log(`${r.status === 200 ? 'OK  ' : 'FAIL'} ${m.padEnd(26)} status ${r.status} (${r.ms} ms) ${r.detail}`);
    if (r.status === 200) working.push(m);
    await sleep(1500);
  }
  if (!working.length) { console.log('\nNo model worked. Check GEMINI_API_KEY, or try again in a minute if you saw 429.'); return; }
  const pick = working[0];
  console.log(`\nStep 2: burst test on ${pick} (one call every 2 s, stops at the first 429).\n`);
  let ok = 0; const t0 = Date.now();
  for (let i = 1; i <= 20; i++) {
    const r = await call(pick);
    console.log(`#${i} status ${r.status} (${r.ms} ms)`);
    if (r.status === 429) { console.log(`\nRate limited after ${ok} calls in ${Math.round((Date.now() - t0) / 1000)}s. ${r.detail}`); break; }
    if (r.status === 200) ok++;
    await sleep(2000);
  }
  console.log(`\nPut this in .env.local:  GEMINI_MODEL=${pick}`);
  console.log('One review uses 3 Gemini calls. If the daily limit is small (about 20), switch GEMINI_MODEL to another working model when one runs out: each model has its own counter.');
})();
