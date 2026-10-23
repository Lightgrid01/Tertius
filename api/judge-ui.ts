import { z } from 'zod';
import type { Evidence, JudgeUiRequest, JudgeUiResponse, Part } from '../src/shared/types';
import { clampParts, scoreFromParts } from '../src/shared/score';
import { normalizeLiveUrl } from '../src/lib/url';
import { ApiException, handle } from './_lib/http';
import { fetchPsi, type PsiResult, type Strategy } from './_lib/pagespeed';
import { generateJson } from './_lib/gemini';
import { UI_RUBRIC, UI_SYSTEM, uiPrompt } from './_lib/prompts';
import { verifyBox } from './_lib/verify-evidence';

const Body = z.object({ liveUrl: z.string().max(500) });
const KEYS = UI_RUBRIC.map((r) => r.key) as [string, ...string[]];
const Item = z.discriminatedUnion('type', [
  z.object({ type: z.literal('region'), screenshot: z.enum(['desktop', 'mobile']), box: z.array(z.number()).length(4), note: z.string().max(300) }),
  z.object({ type: z.literal('metric'), metric: z.string().max(60) }),
]);
const ModelOut = z.object({
  parts: z.array(z.object({
    key: z.enum(KEYS), points: z.number().nullable(), advice: z.string().max(160).default(''), why: z.string().max(500).default(''), evidence: z.array(Item).max(4).default([]),
  })).length(5),
  evidenceLines: z.array(z.string().max(300)).min(1).max(4),
  observedSummary: z.string().max(900).default(''),
});

/** Gemini boxes are [ymin, xmin, ymax, xmax] in 0-1000. The page stores [x, y, width, height] as 0-1 fractions. */
const toFractionBox = (b: number[]): number[] => {
  const [ymin, xmin, ymax, xmax] = b.map((n) => n / 1000);
  return [xmin, ymin, xmax - xmin, ymax - ymin];
};

export const run = async (raw: JudgeUiRequest): Promise<JudgeUiResponse> => {
  const parsed = Body.safeParse(raw);
  const url = parsed.success ? normalizeLiveUrl(parsed.data.liveUrl) : null;
  if (!url) throw new ApiException('bad_input', 'Enter the public address of your live page.');

  const strategies: Strategy[] = ['mobile', 'desktop'];
  const settled = await Promise.allSettled(strategies.map((s) => fetchPsi(url, s)));
  const ok = settled.filter((s): s is PromiseFulfilledResult<PsiResult> => s.status === 'fulfilled').map((s) => s.value);
  if (ok.length === 0) {
    const err = (settled[0] as PromiseRejectedResult).reason;
    const rate = settled.some((s) => s.status === 'rejected' && s.reason instanceof ApiException && s.reason.code === 'rate_limited');
    if (rate) throw new ApiException('rate_limited', 'PageSpeed quota reached. Add a PSI_API_KEY or retry later.');
    throw err instanceof ApiException ? err : new ApiException('live_ui_failed', 'couldn’t load the live UI');
  }
  const shots = ok.sort((a, b) => (a.strategy === 'desktop' ? -1 : 1) - (b.strategy === 'desktop' ? -1 : 1)); // desktop first
  const metrics = Object.assign({}, ...shots.map((s) => s.metrics)) as PsiResult['metrics'];

  const out = await generateJson({
    system: UI_SYSTEM,
    prompt: uiPrompt({ url, shots, metrics }),
    images: shots.map((s) => ({ mimeType: s.screenshot.slice(5, s.screenshot.indexOf(';')), data: s.screenshot.slice(s.screenshot.indexOf(',') + 1) })),
    schema: ModelOut,
  });

  const have = new Set(shots.map((s) => s.strategy));
  const byKey = new Map(out.parts.map((p) => [p.key, p]));
  if (byKey.size !== 5) throw new ApiException('failed', 'The model skipped a part. Retry.');
  let verified = 0;
  const parts: Part[] = UI_RUBRIC.map((r) => {
    const m = byKey.get(r.key)!;
    const evidence: Evidence[] = [];
    for (const it of m.evidence) {
      if (it.type === 'region') {
        if (!have.has(it.screenshot)) continue;
        const box = verifyBox(toFractionBox(it.box));
        if (box) { evidence.push({ kind: 'region', screenshot: it.screenshot, box, note: it.note }); verified++; }
      } else if (metrics[it.metric]) {
        evidence.push({ kind: 'metric', name: metrics[it.metric].name, value: metrics[it.metric].value }); verified++;
      }
    }
    let points = m.points === null ? null : Math.min(r.max, Math.max(0, Math.round(m.points)));
    // A screenshot cannot show a missing state: only a visibly broken one (a region) may cost points on this part.
    if (r.key === 'states' && points !== null && points < r.max && !evidence.some((e) => e.kind === 'region')) points = null;
    return { key: r.key, label: r.label, max: r.max, points, advice: m.advice || undefined, why: m.why || undefined, evidence: points === null ? [] : evidence };
  });
  if (verified === 0) throw new ApiException('no_verified_evidence', 'None of the findings could be matched to the screenshots. Retry.');

  const clamped = clampParts(parts);
  const score = scoreFromParts(clamped);
  if (score === null) throw new ApiException('no_verified_evidence', 'Nothing on the page could be observed. Retry.');
  const shot = (s: Strategy) => shots.find((x) => x.strategy === s)?.screenshot;
  return {
    result: {
      judge: 'ui', score, parts: clamped, evidenceLines: out.evidenceLines.slice(0, 3), observedSummary: out.observedSummary,
      screenshots: { mobile: shot('mobile') ?? shot('desktop')!, desktop: shot('desktop') ?? shot('mobile')! },
    },
  };
};

export default handle<JudgeUiRequest, JudgeUiResponse>(run);
