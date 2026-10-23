import { z } from 'zod';
import type { CheckInputsRequest, CheckInputsResponse } from '../src/shared/types';
import { classifyDevpost, parseRepoUrl } from '../src/lib/url';
import { ApiException, handle } from './_lib/http';
import { getRepo } from './_lib/github';

const Body = z.object({ repoUrl: z.string().max(300), devpost: z.string().max(40000).optional() });
const MAX_TEXT = 12000;

function htmlToText(html: string): string {
  const meta = html.match(/<meta[^>]+(?:property|name)=["'](?:og:)?description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '';
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return `${meta}\n${body}`.trim().slice(0, MAX_TEXT);
}

const isDevpost = (h: string) => h === 'devpost.com' || h.endsWith('.devpost.com');

export async function fetchDevpost(url: string): Promise<string> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!isDevpost(new URL(current).hostname.toLowerCase())) throw new ApiException('devpost_unreadable', 'Redirected away from Devpost.');
    let res: Response;
    try {
      res = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; tertius-review)', Accept: 'text/html' }, signal: AbortSignal.timeout(9000) });
    } catch { throw new ApiException('devpost_unreadable', 'Couldn’t reach that Devpost page.'); }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location')!, current).toString(); continue; }
    if (!res.ok) throw new ApiException('devpost_unreadable', 'Devpost didn’t return that page.');
    const text = htmlToText((await res.text()).slice(0, 600_000));
    if (text.length < 80) throw new ApiException('devpost_unreadable', 'That page had no readable description.');
    return text;
  }
  throw new ApiException('devpost_unreadable', 'Too many redirects.');
}

export const run = async (raw: CheckInputsRequest): Promise<CheckInputsResponse> => {
  const parsed = Body.safeParse(raw);
  if (!parsed.success) throw new ApiException('bad_input', 'Send a repository URL.');
  const ref = parseRepoUrl(parsed.data.repoUrl);
  if (!ref) throw new ApiException('repo_not_found', 'repo not found or private');
  const dev = classifyDevpost(parsed.data.devpost ?? '');
  if (dev.kind === 'invalid') throw new ApiException('bad_input', dev.reason);

  const [info, devpostText] = await Promise.all([
    getRepo(ref.owner, ref.repo),
    dev.kind === 'url' ? fetchDevpost(dev.url) : Promise.resolve(dev.kind === 'text' ? dev.text.slice(0, MAX_TEXT) : undefined),
  ]);
  return { owner: ref.owner, repo: ref.repo, description: info.description, defaultBranch: info.defaultBranch, ...(devpostText ? { devpostText } : {}) };
};

export default handle<CheckInputsRequest, CheckInputsResponse>(run);
