import { ApiException } from './http';

export type Strategy = 'mobile' | 'desktop';
export type PsiResult = {
  strategy: Strategy;
  screenshot: string; // data URI
  /** metric id -> {name, value} shown as evidence. Values come from PageSpeed, never from the model. */
  metrics: Record<string, { name: string; value: string }>;
};

const SHOT = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
type Audit = { score?: number | null; displayValue?: string; details?: { data?: string } };
type Lh = {
  categories?: Record<string, { score: number | null }>;
  audits?: Record<string, Audit>;
  fullPageScreenshot?: { screenshot?: { data?: string } };
  runtimeError?: { code: string; message: string };
};

export async function fetchPsi(url: string, strategy: Strategy): Promise<PsiResult> {
  const q = new URLSearchParams({ url, strategy });
  for (const c of ['performance', 'accessibility', 'best-practices']) q.append('category', c);
  if (process.env.PSI_API_KEY) q.set('key', process.env.PSI_API_KEY);
  const hasKey = !!process.env.PSI_API_KEY;
  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(110000) });
    } catch {
      throw new ApiException('live_ui_failed', 'couldn’t load the live UI');
    }
    if (res.status === 429 && attempt === 0) { await new Promise((r) => setTimeout(r, 4000)); continue; }
    break;
  }
  if (!res) throw new ApiException('live_ui_failed', 'couldn’t load the live UI');
  if (res.status === 429) {
    throw new ApiException('rate_limited', hasKey
      ? 'PageSpeed quota reached for your key. Retry in a minute.'
      : 'PageSpeed quota reached and no PSI_API_KEY is loaded. Add it to .env.local and restart npm start.');
  }
  if ((res.status === 400 || res.status === 403) && hasKey) {
    let msg = '';
    try { msg = ((await res.json()) as { error?: { message?: string } }).error?.message?.slice(0, 160) ?? ''; } catch { /* ignore */ }
    console.error('PageSpeed rejected the key:', res.status, msg);
    throw new ApiException('failed', `PageSpeed rejected the PSI_API_KEY: ${msg || res.status}. Check the key and that the PageSpeed Insights API is enabled.`);
  }
  if (!res.ok) throw new ApiException('live_ui_failed', 'couldn’t load the live UI');
  const j = (await res.json()) as { lighthouseResult?: Lh };
  const lh = j.lighthouseResult;
  if (!lh || lh.runtimeError) throw new ApiException('live_ui_failed', 'couldn’t load the live UI');

  const shot = lh.audits?.['final-screenshot']?.details?.data ?? lh.fullPageScreenshot?.screenshot?.data ?? '';
  if (!SHOT.test(shot)) throw new ApiException('live_ui_failed', 'couldn’t load the live UI');

  const tag = strategy === 'mobile' ? 'mobile' : 'desktop';
  const metrics: PsiResult['metrics'] = {};
  const cat = (id: string, key: string, label: string) => {
    const s = lh.categories?.[id]?.score;
    if (typeof s === 'number') metrics[`${tag}.${key}`] = { name: `${label} (${tag})`, value: `${Math.round(s * 100)} / 100` };
  };
  cat('performance', 'performance', 'Performance'); cat('accessibility', 'accessibility', 'Accessibility'); cat('best-practices', 'best_practices', 'Best practices');
  const aud = (id: string, key: string, label: string) => {
    const v = lh.audits?.[id]?.displayValue;
    if (v) metrics[`${tag}.${key}`] = { name: `${label} (${tag})`, value: v.replace(/\u00a0/g, ' ') };
  };
  aud('largest-contentful-paint', 'lcp', 'Largest contentful paint'); aud('cumulative-layout-shift', 'cls', 'Layout shift');
  aud('total-blocking-time', 'tbt', 'Total blocking time'); aud('first-contentful-paint', 'fcp', 'First contentful paint');
  return { strategy, screenshot: shot, metrics };
}
