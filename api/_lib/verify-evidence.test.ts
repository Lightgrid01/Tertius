import { describe, expect, it } from 'vitest';
import { verifyBox, verifyQuote, verifyQuotes } from './verify-evidence';

const sources = { 'README.md': 'Run `npm install`\nthen   npm run dev to start.', 'src/a.ts': 'export const x = 1; // TODO: finish' };

describe('verifyQuote', () => {
  it('keeps a real quote, even across whitespace changes', () => {
    expect(verifyQuote('then npm run dev to start', 'README.md', sources)).toBe('README.md');
  });
  it('drops a made-up quote', () => {
    expect(verifyQuote('supports Kubernetes autoscaling', 'README.md', sources)).toBeNull();
  });
  it('re-attributes a quote found in another source', () => {
    expect(verifyQuote('TODO: finish', 'README.md', sources)).toBe('src/a.ts');
  });
  it('drops too-short and too-long quotes', () => {
    expect(verifyQuote('x', 'src/a.ts', sources)).toBeNull();
    expect(verifyQuote('a'.repeat(400), 'src/a.ts', { 'src/a.ts': 'a'.repeat(400) })).toBeNull();
  });
});
describe('verifyBox', () => {
  it('accepts a box inside the image', () => expect(verifyBox([0.1, 0.1, 0.5, 0.5])).toEqual([0.1, 0.1, 0.5, 0.5]));
  it('rejects boxes outside the image or empty', () => {
    expect(verifyBox([0.6, 0.1, 0.6, 0.2])).toBeNull();
    expect(verifyBox([0.1, 0.1, 0, 0.2])).toBeNull();
    expect(verifyBox([0.1, 0.1, 0.2])).toBeNull();
  });
});
describe('verifyQuotes', () => {
  it('drops unverified and duplicate quotes', () => {
    const out = verifyQuotes([
      { source: 'README.md', quote: 'npm run dev' }, { source: 'README.md', quote: 'npm   run dev' }, { source: 'README.md', quote: 'invented line here' },
    ], sources);
    expect(out).toHaveLength(1);
  });
});
