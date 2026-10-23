import { describe, expect, it } from 'vitest';
import { computeFacts, pickFiles, scanSecrets } from './secrets-scan';

describe('scanSecrets', () => {
  it('finds a real-looking key and redacts it', () => {
    const f = scanSecrets([{ path: 'src/a.ts', text: 'const k = "AIzaSyA1234567890abcdefghijklmnopqrstuv";' }], []);
    expect(f).toHaveLength(1);
    expect(f[0].preview).not.toContain('abcdefgh');
  });
  it('ignores placeholders, env reads and .env.example', () => {
    const files = [
      { path: 'a.ts', text: 'const k = process.env.API_KEY; const t = "token: your_token_here_please"' },
      { path: '.env.example', text: 'API_KEY="AKIAABCDEFGHIJKLMNOP"' },
    ];
    expect(scanSecrets(files, [])).toHaveLength(0);
  });
  it('flags a committed .env but not .env.example', () => {
    const f = scanSecrets([], [{ path: '.env', size: 10 }, { path: '.env.example', size: 10 }]);
    expect(f.map((x) => x.path)).toEqual(['.env']);
  });
});
describe('computeFacts', () => {
  const tree = [{ path: 'src/a.ts', size: 10 }, { path: 'tsconfig.json', size: 5 }, { path: 'docs/prd.md', size: 5 }, { path: '.env.example', size: 5 }];
  it('reads structure and commit spread', () => {
    const c = [{ date: '2026-01-01T10:00:00Z', message: 'a' }, { date: '2026-01-01T12:00:00Z', message: 'b' }, { date: '2026-01-11T12:00:00Z', message: 'c' }];
    const f = computeFacts(tree, false, [{ path: 'src/a.ts', text: '// TODO fix\nthrow new Error("not implemented")' }], c, false);
    expect(f).toMatchObject({ hasEnvExample: true, hasTypeScript: true, hasPlanningDocs: true, hasTests: false, commitCount: 3, commitDays: 2, spanDays: 10, todoMarkers: 1, stubMarkers: 1 });
  });
});
describe('pickFiles', () => {
  it('picks config, entry points and big sources within the limit, skipping junk', () => {
    const tree = [
      { path: 'package.json', size: 100 }, { path: 'src/main.tsx', size: 200 }, { path: 'src/big.ts', size: 9000 },
      { path: 'node_modules/x/index.js', size: 9999 }, { path: 'public/logo.png', size: 5000 },
      ...Array.from({ length: 30 }, (_, i) => ({ path: `src/f${i}.ts`, size: 100 + i })),
    ];
    const p = pickFiles(tree);
    expect(p.length).toBeLessThanOrEqual(12);
    expect(p).toContain('package.json');
    expect(p).toContain('src/big.ts');
    expect(p.some((x) => x.includes('node_modules') || x.includes('.png'))).toBe(false);
  });
});
