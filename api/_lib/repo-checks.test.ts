import { describe, expect, it } from 'vitest';
import { historyPart, historyPoints, hygieneChecks, partFromChecks, setupChecks, subProjects } from './repo-checks';
import type { RepoFacts } from './secrets-scan';

const facts = (o: Partial<RepoFacts> = {}): RepoFacts => ({
  fileCount: 10, treeTruncated: false, hasEnvExample: false, hasTests: false, hasTypeScript: false, hasPlanningDocs: false,
  stubMarkers: 0, todoMarkers: 0, commitCount: 9, commitDays: 5, spanDays: 12, firstCommit: '2026-08-31', lastCommit: '2026-09-12', secrets: [], ...o,
});
const t = (...p: string[]) => p.map((path) => ({ path, size: 10 }));
const README = '# App\n## Prerequisites\nNode 20 and a funded Sepolia wallet.\n```\nnpm install\nnpm run dev\n```\nCopy .env.example to .env\n';

describe('setupChecks', () => {
  it('passes a complete README with all five checks', () => {
    const c = setupChecks(README, t('README.md', '.env.example'), facts({ hasEnvExample: true }));
    expect(c.every((x) => x.pass)).toBe(true);
    expect(partFromChecks('setup', 'Setup', c).points).toBe(25);
  });
  it('is the same every time for the same input', () => {
    const a = partFromChecks('setup', 'S', setupChecks(README, t('README.md'), facts()));
    const b = partFromChecks('setup', 'S', setupChecks(README, t('README.md'), facts()));
    expect(a).toEqual(b);
  });
  it('fails install/run/prereq on an empty README and says so', () => {
    const p = partFromChecks('setup', 'S', setupChecks('', t('src/a.ts'), facts()));
    expect(p.points).toBe(5); // only "sub-projects" (none) passes
    expect(p.evidence[0]).toMatchObject({ kind: 'metric', value: 'no README found' });
  });
  it('flags a sub-project with no README of its own and no mention in the root README', () => {
    const tree = t('README.md', 'worker/package.json', 'dashboard/package.json', 'dashboard/README.md', 'contracts/foundry.toml');
    const c = setupChecks('npm install\nnpm run dev\n.env\nNode 20\nworker is described here', tree, facts({ hasEnvExample: true }));
    const sub = c.find((x) => x.id === 'subprojects')!;
    expect(subProjects(tree).sort()).toEqual(['contracts', 'dashboard', 'worker']);
    expect(sub.pass).toBe(false);
    expect(sub.evidence[0]).toMatchObject({ value: 'contracts' });
  });
  it('quotes only text that is in the README', () => {
    const c = setupChecks(README, t('README.md'), facts());
    for (const e of c.flatMap((x) => x.evidence)) if (e.kind === 'quote') expect(README.replace(/\s+/g, ' ')).toContain(e.quote.replace(/\.\.\.$/, ''));
  });
});

describe('hygieneChecks', () => {
  it('scores 15 when everything is present', () => {
    const p = partFromChecks('hygiene', 'H', hygieneChecks(t('.gitignore', 'tsconfig.json'), facts({ hasTests: true, hasTypeScript: true })));
    expect(p.points).toBe(15);
  });
  it('names the heaviest missing item first', () => {
    const p = partFromChecks('hygiene', 'H', hygieneChecks(t('src/a.js'), facts()));
    expect(p.points).toBe(4); // secrets only
    expect(p.advice).toBe('Add automated tests.');
  });
  it('fails the secrets check when a secret is found', () => {
    const f = facts({ secrets: [{ path: '.env', kind: 'committed env file', line: 0, preview: '.env' }] });
    const c = hygieneChecks(t('.gitignore'), f).find((x) => x.id === 'secrets')!;
    expect(c.pass).toBe(false);
  });
});

describe('historyPoints', () => {
  it('rewards sustained work and punishes one dump', () => {
    expect(historyPoints(facts())).toBe(9);
    expect(historyPoints(facts({ commitCount: 1, commitDays: 1, spanDays: 0 }))).toBeLessThanOrEqual(2);
    expect(historyPoints(facts({ commitCount: 30, commitDays: 10, spanDays: 20 }))).toBe(10);
    expect(historyPart(facts({ commitCount: 30, commitDays: 10, spanDays: 20 })).advice).toBeUndefined();
  });
});
