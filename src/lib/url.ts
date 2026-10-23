// URL checks shared by the page and the functions (the functions re-validate everything).

export type RepoRef = { owner: string; repo: string };

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export function parseRepoUrl(input: string): RepoRef | null {
  const raw = input.trim();
  if (!raw) return null;
  const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s?#]+)\/([^/\s?#]+)/i);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, '');
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo };
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\..*|10\..*|192\.168\..*|172\.(1[6-9]|2\d|3[01])\..*|169\.254\..*|\[.*\])$/i;

/** Returns a normalised https/http URL, or null. A bare domain gets https://. */
export function normalizeLiveUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!u.hostname.includes('.') || PRIVATE_HOST.test(u.hostname)) return null;
  return u.toString();
}

export type DevpostInput =
  | { kind: 'none' }
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'invalid'; reason: string };

/** A single token that looks like a link is a URL (devpost.com only); anything else is pasted text. */
export function classifyDevpost(input: string): DevpostInput {
  const raw = input.trim();
  if (!raw) return { kind: 'none' };
  const looksLikeLink = !/\s/.test(raw) && /^(https?:\/\/|[a-z0-9-]+\.[a-z]{2,}(\/|$))/i.test(raw);
  if (!looksLikeLink) return { kind: 'text', text: raw };
  const url = normalizeLiveUrl(raw);
  if (!url) return { kind: 'invalid', reason: 'That link doesn’t look right.' };
  const host = new URL(url).hostname.toLowerCase();
  if (host !== 'devpost.com' && !host.endsWith('.devpost.com')) {
    return { kind: 'invalid', reason: 'Use a devpost.com link, or paste the description text.' };
  }
  return { kind: 'url', url };
}
