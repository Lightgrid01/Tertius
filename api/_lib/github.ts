import { ApiException } from './http';

const BASE = 'https://api.github.com';

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json', 'User-Agent': 'tertius-review', 'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GitHub call with up to 3 attempts: flaky connections are common, so a network failure is retried before giving up. */
async function gh(path: string): Promise<Response> {
  let cause = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers: headers(), signal: AbortSignal.timeout(25000) });
      if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
        throw new ApiException('rate_limited', 'GitHub rate limit reached. Add a GITHUB_TOKEN or retry later.');
      }
      if (res.status >= 500 && attempt < 2) { await wait(1000 * (attempt + 1)); continue; }
      return res;
    } catch (e) {
      if (e instanceof ApiException) throw e;
      cause = e instanceof Error ? `${e.message}${e.cause instanceof Error ? `: ${e.cause.message}` : ''}` : 'network error';
      if (attempt < 2) await wait(1000 * (attempt + 1));
    }
  }
  console.error('github fetch failed', path, cause);
  throw new ApiException('failed', `Couldn’t reach GitHub (${cause}). Check your connection and retry.`);
}

export type RepoInfo = { description: string | null; defaultBranch: string; isPrivate: boolean; archived: boolean };

export async function getRepo(owner: string, repo: string): Promise<RepoInfo> {
  const res = await gh(`/repos/${owner}/${repo}`);
  if (res.status === 404 || res.status === 403 || res.status === 401) throw new ApiException('repo_not_found', 'repo not found or private');
  if (!res.ok) throw new ApiException('failed', `GitHub returned ${res.status}.`);
  const j = (await res.json()) as { description: string | null; default_branch: string; private: boolean; archived: boolean };
  if (j.private) throw new ApiException('repo_not_found', 'repo not found or private');
  return { description: j.description, defaultBranch: j.default_branch, isPrivate: j.private, archived: j.archived };
}

const decode = (b64: string) => Buffer.from(b64.replace(/\n/g, ''), 'base64').toString('utf8');

export async function getReadme(owner: string, repo: string): Promise<{ path: string; text: string }> {
  const res = await gh(`/repos/${owner}/${repo}/readme`);
  if (res.status === 404) return { path: 'README.md', text: '' };
  if (!res.ok) throw new ApiException('failed', `GitHub returned ${res.status} for the README.`);
  const j = (await res.json()) as { path: string; content: string; encoding: string };
  return { path: j.path, text: j.encoding === 'base64' ? decode(j.content) : '' };
}

export type TreeEntry = { path: string; size: number };
export async function getTree(owner: string, repo: string, branch: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const res = await gh(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (res.status === 404 || res.status === 409) return { entries: [], truncated: false }; // empty repo
  if (!res.ok) throw new ApiException('failed', `GitHub returned ${res.status} for the file tree.`);
  const j = (await res.json()) as { tree: { path: string; type: string; size?: number }[]; truncated: boolean };
  return { entries: j.tree.filter((t) => t.type === 'blob').map((t) => ({ path: t.path, size: t.size ?? 0 })), truncated: j.truncated };
}

export type CommitInfo = { date: string; message: string };
export async function getCommits(owner: string, repo: string): Promise<CommitInfo[]> {
  const res = await gh(`/repos/${owner}/${repo}/commits?per_page=100`);
  if (res.status === 409 || res.status === 404) return [];
  if (!res.ok) throw new ApiException('failed', `GitHub returned ${res.status} for commits.`);
  const j = (await res.json()) as { commit: { author: { date: string } | null; committer: { date: string } | null; message: string } }[];
  return j.map((c) => ({ date: (c.commit.author ?? c.commit.committer)?.date ?? '', message: c.commit.message.split('\n')[0] })).filter((c) => c.date);
}

export async function getFile(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
  const enc = path.split('/').map(encodeURIComponent).join('/');
  const res = await gh(`/repos/${owner}/${repo}/contents/${enc}?ref=${encodeURIComponent(ref)}`);
  if (!res.ok) return null;
  const j = (await res.json()) as { content?: string; encoding?: string; type?: string };
  if (j.type !== 'file' || !j.content || j.encoding !== 'base64') return null;
  const text = decode(j.content);
  return text.includes('\u0000') ? null : text; // skip binary
}
