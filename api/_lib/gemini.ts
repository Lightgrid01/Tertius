import type { z } from 'zod';
import { ApiException } from './http';

export type InlineImage = { mimeType: string; data: string }; // data = base64, no prefix

type Opts<T> = {
  system: string;
  prompt: string;
  images?: InlineImage[];
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  temperature?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const geminiModel = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
export const fallbackModel = () => process.env.GEMINI_FALLBACK_MODEL || '';

/** One request. Retries once after a short pause on 429/500/503, then maps to rate_limited or overloaded. */
async function request(body: unknown, model: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ApiException('failed', 'GEMINI_API_KEY is not set on the server.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(85000),
      });
    } catch {
      throw new ApiException('failed', 'Couldn’t reach the model.');
    }
    if (res.status === 429 || res.status === 500 || res.status === 503) {
      if (attempt === 0) { await sleep(2500); continue; }
      throw new ApiException(res.status === 429 ? 'rate_limited' : 'overloaded',
        res.status === 429 ? 'The free model quota is used up for now. Retry in a minute.' : 'The model is overloaded. Retry in a moment.');
    }
    if (res.status === 404) throw new ApiException('failed', `Model “${model}” was not found. Check GEMINI_MODEL.`);
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new ApiException('failed', 'The model rejected the request. Check GEMINI_API_KEY and GEMINI_MODEL.');
    }
    if (!res.ok) throw new ApiException('failed', `The model returned ${res.status}.`);
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  }
  throw new ApiException('failed', 'The model did not answer.');
}

const unfence = (t: string) => t.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

/** Calls Gemini for JSON, validates with Zod. Malformed output gets one automatic retry. */
export async function generateJson<T>(o: Opts<T>): Promise<T> {
  const parts: unknown[] = [{ text: o.prompt }];
  for (const img of o.images ?? []) parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  // Built per model: the fallback model may not accept the same options as the main one.
  const buildBody = (m: string) => ({
    systemInstruction: { parts: [{ text: o.system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json', temperature: o.temperature ?? 0, seed: 7,
      // Thinking adds run-to-run variation. Off by default on Gemini 2.5 Flash models; set GEMINI_THINKING=on to restore it.
      ...(/^gemini-2\.5-flash/.test(m) && process.env.GEMINI_THINKING !== 'on' ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  });
  let model = geminiModel();
  let lastIssue = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      text = await request(buildBody(model), model);
    } catch (e) {
      // Each model has its own free quota: on a rate limit or overload, switch once to the fallback model.
      const switchable = e instanceof ApiException && (e.code === 'rate_limited' || e.code === 'overloaded');
      if (switchable && fallbackModel() && model !== fallbackModel()) { model = fallbackModel(); text = await request(buildBody(model), model); }
      else throw e;
    }
    try {
      return o.schema.parse(JSON.parse(unfence(text)));
    } catch (e) {
      lastIssue = e instanceof Error ? e.message.slice(0, 200) : 'invalid output';
    }
  }
  throw new ApiException('failed', `The model returned malformed output twice (${lastIssue}). Retry.`);
}
