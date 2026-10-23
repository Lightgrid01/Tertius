import { describe, expect, it } from 'vitest';
import { classifyDevpost, normalizeLiveUrl, parseRepoUrl } from './url';

describe('parseRepoUrl', () => {
  it('accepts common GitHub forms', () => {
    expect(parseRepoUrl('https://github.com/vercel/next.js')).toEqual({ owner: 'vercel', repo: 'next.js' });
    expect(parseRepoUrl('github.com/a/b.git')).toEqual({ owner: 'a', repo: 'b' });
    expect(parseRepoUrl('https://github.com/a/b/tree/main/src')).toEqual({ owner: 'a', repo: 'b' });
  });
  it('rejects others', () => {
    for (const bad of ['', 'https://gitlab.com/a/b', 'https://github.com/a', 'not a url', 'https://github.com/-/x']) {
      expect(parseRepoUrl(bad)).toBeNull();
    }
  });
});
describe('normalizeLiveUrl', () => {
  it('adds https and rejects private hosts', () => {
    expect(normalizeLiveUrl('tertius.vercel.app')).toBe('https://tertius.vercel.app/');
    expect(normalizeLiveUrl('http://localhost:3000')).toBeNull();
    expect(normalizeLiveUrl('https://192.168.1.5')).toBeNull();
    expect(normalizeLiveUrl('ftp://example.com')).toBeNull();
    expect(normalizeLiveUrl('hello world')).toBeNull();
  });
});
describe('classifyDevpost', () => {
  it('handles none, url, text, invalid', () => {
    expect(classifyDevpost('  ').kind).toBe('none');
    expect(classifyDevpost('https://devpost.com/software/x').kind).toBe('url');
    expect(classifyDevpost('A tool that helps people ship faster.').kind).toBe('text');
    expect(classifyDevpost('https://example.com/x').kind).toBe('invalid');
  });
});
