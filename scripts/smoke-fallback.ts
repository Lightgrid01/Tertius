import { z } from 'zod';
import { generateJson } from '../api/_lib/gemini';
process.env.GEMINI_API_KEY='k'; process.env.GEMINI_MODEL='main-model'; process.env.GEMINI_FALLBACK_MODEL='backup-model';
const used: string[] = [];
globalThis.fetch = (async (u: any) => { const m = String(u).match(/models\/([^:]+):/)![1]; used.push(m);
  if (m === 'main-model') return new Response('{}', { status: 429 });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }), { status: 200 }); }) as typeof fetch;
generateJson({ system: 's', prompt: 'p', schema: z.object({ a: z.number() }) }).then((r) => console.log('result', r, 'models tried:', used));
