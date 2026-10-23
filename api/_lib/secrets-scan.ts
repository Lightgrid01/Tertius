import type { CommitInfo, TreeEntry } from './github';

export type FileText = { path: string; text: string };
export type SecretFinding = { path: string; kind: string; line: number; preview: string };

const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { kind: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { kind: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: 'API secret key', re: /\bsk-[A-Za-z0-9_-]{24,}\b/ },
  { kind: 'private key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { kind: 'hard-coded credential', re: /\b(?:api[_-]?key|secret|token|passw(?:or)?d)\b["']?\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{16,}["']/i },
];
const PLACEHOLDER = /(your[_-]|xxx|example|changeme|placeholder|<.*>|\.\.\.|process\.env|import\.meta\.env|\$\{)/i;
const SKIP_PATH = /(^|\/)(\.env\.(example|sample|template)|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|.*\.lock)$/i;
const ENV_FILE = /(^|\/)\.env(\.[^/]+)?$/i;
const ENV_SAFE = /\.(example|sample|template|dist)$/i;

const redact = (s: string) => (s.length <= 8 ? '••••' : `${s.slice(0, 4)}…${'•'.repeat(4)}`);

export function scanSecrets(files: FileText[], tree: TreeEntry[]): SecretFinding[] {
  const out: SecretFinding[] = [];
  for (const t of tree) {
    if (ENV_FILE.test(t.path) && !ENV_SAFE.test(t.path)) out.push({ path: t.path, kind: 'committed env file', line: 0, preview: t.path });
  }
  for (const f of files) {
    if (SKIP_PATH.test(f.path)) continue;
    f.text.split('\n').forEach((line, i) => {
      if (line.length > 400) return;
      for (const p of PATTERNS) {
        const m = line.match(p.re);
        if (m && !PLACEHOLDER.test(line)) { out.push({ path: f.path, kind: p.kind, line: i + 1, preview: redact(m[0]) }); break; }
      }
    });
  }
  return out;
}

export type RepoFacts = {
  fileCount: number;
  treeTruncated: boolean;
  hasEnvExample: boolean;
  hasTests: boolean;
  hasTypeScript: boolean;
  hasPlanningDocs: boolean;
  stubMarkers: number;
  todoMarkers: number;
  commitCount: number;
  commitDays: number; // distinct calendar days with commits (UTC)
  spanDays: number; // first to last commit
  firstCommit: string | null;
  lastCommit: string | null;
  secrets: SecretFinding[];
};

const TEST_PATH = /(^|\/)(tests?|__tests__|spec|e2e)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py)$/i;
const PLAN_PATH = /(^|\/)(prd|spec|specs|plan|planning|roadmap|scope|design|architecture|requirements)[^/]*\.(md|txt)$|(^|\/)docs?\//i;
const STUB = /not implemented|notimplemented|lorem ipsum|placeholder|mock data|coming soon|stub/i;
const TODO = /\b(TODO|FIXME|XXX|HACK)\b/;

export function computeFacts(tree: TreeEntry[], truncated: boolean, files: FileText[], commits: CommitInfo[], pkgTestScript: boolean): RepoFacts {
  const paths = tree.map((t) => t.path);
  const days = new Set(commits.map((c) => c.date.slice(0, 10)));
  const times = commits.map((c) => Date.parse(c.date)).filter(Number.isFinite).sort((a, b) => a - b);
  let stub = 0, todo = 0;
  for (const f of files) {
    if (/\.(md|txt|json)$/i.test(f.path)) continue;
    for (const line of f.text.split('\n')) { if (STUB.test(line)) stub++; if (TODO.test(line)) todo++; }
  }
  return {
    fileCount: tree.length,
    treeTruncated: truncated,
    hasEnvExample: paths.some((p) => /(^|\/)\.env\.(example|sample|template)$/i.test(p)),
    hasTests: pkgTestScript || paths.some((p) => TEST_PATH.test(p)),
    hasTypeScript: paths.some((p) => /(^|\/)tsconfig[^/]*\.json$/.test(p) || /\.tsx?$/.test(p)),
    hasPlanningDocs: paths.some((p) => PLAN_PATH.test(p)),
    stubMarkers: stub,
    todoMarkers: todo,
    commitCount: commits.length,
    commitDays: days.size,
    spanDays: times.length > 1 ? Math.round((times[times.length - 1] - times[0]) / 86400000) : 0,
    firstCommit: times.length ? new Date(times[0]).toISOString().slice(0, 10) : null,
    lastCommit: times.length ? new Date(times[times.length - 1]).toISOString().slice(0, 10) : null,
    secrets: scanSecrets(files, tree),
  };
}

// ---- which files to read ---------------------------------------------------

const SRC_EXT = /\.(tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|rb|php|vue|svelte|swift|cs|sol)$/i;
const CONFIG = /(^|\/)(package\.json|tsconfig\.json|vite\.config\.[a-z]+|next\.config\.[a-z]+|requirements\.txt|pyproject\.toml|Cargo\.toml|go\.mod|vercel\.json|\.env\.(example|sample|template)|Dockerfile)$/i;
const ENTRY = /(^|\/)(src\/)?(main|index|App|app|server|page|layout)\.[a-z]+$|(^|\/)(pages|app)\/(index|page)\.[a-z]+$/i;
const JUNK = /(^|\/)(node_modules|dist|build|vendor|\.next|coverage|public|assets|static|__pycache__)\/|\.min\.|\.d\.ts$|\.(lock|svg|png|jpe?g|webp|gif|ico|map|woff2?)$/i;

export const FILE_LIMIT = 12;
export const PER_FILE_CHARS = 9000;
export const TOTAL_CHARS = 80000;

export function pickFiles(tree: TreeEntry[]): string[] {
  const ok = tree.filter((t) => !JUNK.test(t.path) && t.size > 0 && t.size < 400_000);
  const picked: string[] = [];
  const add = (p: string) => { if (!picked.includes(p) && picked.length < FILE_LIMIT) picked.push(p); };
  ok.filter((t) => CONFIG.test(t.path) && t.path.split('/').length <= 3).sort((a, b) => a.path.length - b.path.length).slice(0, 4).forEach((t) => add(t.path));
  ok.filter((t) => ENTRY.test(t.path) && SRC_EXT.test(t.path)).sort((a, b) => a.path.length - b.path.length).slice(0, 3).forEach((t) => add(t.path));
  ok.filter((t) => TEST_PATH.test(t.path) && SRC_EXT.test(t.path)).slice(0, 1).forEach((t) => add(t.path));
  ok.filter((t) => SRC_EXT.test(t.path) && !TEST_PATH.test(t.path)).sort((a, b) => b.size - a.size).forEach((t) => add(t.path));
  return picked;
}
