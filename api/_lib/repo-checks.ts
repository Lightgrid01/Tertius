import type { Evidence, Part } from '../../src/shared/types';
import type { RepoFacts } from './secrets-scan';
import type { TreeEntry } from './github';

/**
 * Setup, Hygiene and History are scored by plain code, not by the model, so the same repo gets the same
 * score every time. Each check is yes/no, worth fixed points, and carries its own evidence.
 */
export type Check = { id: string; label: string; advice: string; max: number; pass: boolean; evidence: Evidence[] };

const line = (text: string, re: RegExp): string | null => {
  for (const l of text.split('\n')) {
    const t = l.trim().replace(/\s+/g, ' ');
    if (t && re.test(t)) return t.length > 200 ? `${t.slice(0, 197)}...` : t;
  }
  return null;
};

const INSTALL = /\b(npm (i|install|ci)\b|yarn( install)?\b|pnpm (i|install)\b|bun install|pip3? install|poetry install|uv (sync|pip)|cargo (build|install)|go (get|mod download|build)|bundle install|composer install|forge install|docker (compose|build))/i;
const RUN = /\b(npm (run )?(dev|start|serve)\b|yarn (dev|start)\b|pnpm (run )?(dev|start)\b|bun (run )?(dev|start)|python3? [\w./-]+|node [\w./-]+|cargo run|go run|docker compose up|forge (test|script|build)|npx [\w./@-]+|vercel dev|flask run|uvicorn)/i;
const CONFIG = /(\.env\b|environment variables?|env vars?|api[_ -]?key|private[_ -]?key|\bsecrets?\b|config(uration)? file)/i;
const PREREQ = /(prerequisites?|requirements?:|node(\.js)?\s*(v|version|>=|\^)?\s*\d|python\s*3|\bnvm\b|rust(up)?\b|foundry|faucet|testnet|funded|wallet|api[_ -]?key|you('| wi)ll need|make sure you have)/i;
const MANIFEST = /^[^/]+\/(package\.json|pyproject\.toml|requirements\.txt|Cargo\.toml|go\.mod|foundry\.toml|hardhat\.config\.[jt]s|Gemfile|composer\.json)$/i;

export function subProjects(tree: TreeEntry[]): string[] {
  return [...new Set(tree.filter((t) => MANIFEST.test(t.path)).map((t) => t.path.split('/')[0]))];
}

export function setupChecks(readme: string, tree: TreeEntry[], facts: RepoFacts): Check[] {
  const quote = (re: RegExp): Evidence[] => {
    const l = line(readme, re);
    return l ? [{ kind: 'quote', source: 'README', quote: l }] : [];
  };
  const miss = (name: string): Evidence[] => [{ kind: 'metric', name, value: readme.trim() ? 'not found in the README' : 'no README found' }];
  const lower = readme.toLowerCase();
  const subs = subProjects(tree);
  const uncovered = subs.filter((d) => {
    const own = tree.some((t) => new RegExp(`^${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(readme|setup|install)[^/]*$`, 'i').test(t.path));
    return !own && !lower.includes(d.toLowerCase());
  });
  const mk = (id: string, label: string, advice: string, max: number, ev: Evidence[], fallback: Evidence[], passOverride?: boolean): Check => {
    const pass = passOverride ?? ev.length > 0;
    return { id, label, advice, max, pass, evidence: pass ? ev : fallback };
  };
  const config = quote(CONFIG);
  return [
    mk('install', 'Install step in the README', 'Add install steps to the README.', 5, quote(INSTALL), miss('Install command')),
    mk('run', 'Run step in the README', 'Add run steps to the README.', 5, quote(RUN), miss('Run command')),
    mk('config', 'Configuration documented', 'Document the required environment variables.', 5,
      facts.hasEnvExample && !config.length ? [{ kind: 'metric', name: '.env.example', value: 'present' }] : config,
      [{ kind: 'metric', name: 'Environment variables', value: facts.hasEnvExample ? 'example file present but never mentioned in the README' : 'no .env.example and not mentioned in the README' }],
      facts.hasEnvExample || config.length > 0),
    mk('prereq', 'Prerequisites stated', 'State prerequisites: versions, keys, funded wallet.', 5, quote(PREREQ), miss('Prerequisites')),
    mk('subprojects', 'Every sub-project has setup instructions', 'Give every sub-project setup instructions.', 5,
      [{ kind: 'metric', name: 'Sub-projects', value: subs.length ? `${subs.join(', ')}: all covered` : 'none (single project)' }],
      [{ kind: 'metric', name: 'Sub-projects without instructions', value: uncovered.join(', ') }], uncovered.length === 0),
  ];
}

const LINT = /(^|\/)(\.eslintrc[^/]*|eslint\.config\.[a-z]+|\.prettierrc[^/]*|ruff\.toml|\.flake8|\.pylintrc|clippy\.toml|\.solhint\.json|biome\.json)$/i;

export function hygieneChecks(tree: TreeEntry[], facts: RepoFacts): Check[] {
  const hasLint = tree.some((t) => LINT.test(t.path));
  return [
    { id: 'tests', label: 'Automated tests present', advice: 'Add automated tests.', max: 6, pass: facts.hasTests,
      evidence: [{ kind: 'metric', name: 'Tests', value: facts.hasTests ? 'present' : 'none found' }] },
    { id: 'secrets', label: 'No committed secrets', advice: 'Remove committed secrets and rotate them.', max: 4, pass: facts.secrets.length === 0,
      evidence: [{ kind: 'metric', name: 'Committed secrets', value: facts.secrets.length ? facts.secrets.map((s) => `${s.kind} in ${s.path}${s.line ? `:${s.line}` : ''}`).join('; ') : 'none found' }] },
    { id: 'tooling', label: 'Types or a linter', advice: 'Add types or a linter.', max: 3, pass: facts.hasTypeScript || hasLint,
      evidence: [{ kind: 'metric', name: 'Types / linter', value: facts.hasTypeScript || hasLint ? 'present' : 'none found' }] },
    { id: 'gitignore', label: '.gitignore present', advice: 'Add a .gitignore.', max: 2, pass: tree.some((t) => t.path === '.gitignore'),
      evidence: [{ kind: 'metric', name: '.gitignore', value: tree.some((t) => t.path === '.gitignore') ? 'present' : 'missing' }] },
  ];
}

export function historyPoints(f: RepoFacts): number {
  let p = 0;
  if (f.commitCount >= 2) p += 3;
  if (f.commitCount >= 5) p += 2;
  if (f.commitDays >= 2) p += 2;
  if (f.commitDays >= 4 || f.spanDays >= 5) p += 2;
  if (f.commitCount >= 10) p += 1;
  return f.commitCount <= 1 ? Math.min(p, 2) : Math.min(p, 10);
}

/** Turn a list of checks into one Part. Failed checks come first as evidence; the heaviest failure names the fix. */
export function partFromChecks(key: string, label: string, checks: Check[]): Part {
  const failed = checks.filter((c) => !c.pass).sort((a, b) => b.max - a.max);
  const max = checks.reduce((s, c) => s + c.max, 0);
  return {
    key, label, max,
    points: checks.filter((c) => c.pass).reduce((s, c) => s + c.max, 0),
    advice: failed[0]?.advice,
    why: failed.length ? `Missing: ${failed.map((c) => c.label.toLowerCase()).join('; ')}.` : undefined,
    evidence: [...failed.flatMap((c) => c.evidence), ...checks.filter((c) => c.pass).flatMap((c) => c.evidence).slice(0, 2)],
  };
}

export function historyPart(f: RepoFacts): Part {
  const points = historyPoints(f);
  return {
    key: 'history', label: 'Sustained commit history', max: 10, points,
    advice: points < 10 ? 'Commit steadily as you build.' : undefined,
    why: points < 10 ? `${f.commitCount} commit${f.commitCount === 1 ? '' : 's'} on ${f.commitDays} day${f.commitDays === 1 ? '' : 's'}.` : undefined,
    evidence: [{ kind: 'metric', name: 'Commits', value: `${f.commitCount} on ${f.commitDays} day${f.commitDays === 1 ? '' : 's'}${f.firstCommit ? ` (${f.firstCommit} to ${f.lastCommit})` : ''}` }],
  };
}
