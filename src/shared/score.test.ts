import { describe, expect, it } from 'vitest';
import { baseScore, checkableCount, claimPenaltyTotal, clampParts, computeReview, scoreFromParts } from './score';
import { rankFixes } from './rank';
import type { Claim, ClaimStatus, JudgeResult, Part } from './types';

const claim = (id: string, status: ClaimStatus, text = `claim ${id}`): Claim => ({
  id, text, source: 'readme', status, evidence: [], pointsLost: 0,
});
const part = (key: string, max: number, points: number | null, withEvidence = true): Part => ({
  key, label: key, max, points,
  evidence: withEvidence ? [{ kind: 'quote', source: 'README.md', quote: `q-${key}` }] : [],
});

describe('judge scores', () => {
  it('Judge I is the sum of 25+25+25+15+10', () => {
    const parts = [part('a', 25, 20), part('b', 25, 15), part('c', 25, 25), part('d', 15, 10), part('e', 10, 5)];
    expect(scoreFromParts(parts)).toBe(75);
  });
  it('Judge II sums 30+25+20+15+10 when everything is observed', () => {
    const parts = [part('a', 30, 30), part('b', 25, 25), part('c', 20, 20), part('d', 15, 15), part('e', 10, 10)];
    expect(scoreFromParts(parts)).toBe(100);
  });
  it('leaves unobserved parts out and scales to 100 over the rest', () => {
    // observed max = 30+25+20 = 75; got 45+... -> 15+25+20 = 60 => 80
    const parts = [part('a', 30, 15), part('b', 25, 25), part('c', 20, 20), part('d', 15, null), part('e', 10, null)];
    expect(scoreFromParts(parts)).toBe(80);
  });
  it('returns null when nothing was observed', () => {
    expect(scoreFromParts([part('a', 30, null)])).toBeNull();
  });
  it('clamps out-of-range points and keeps null', () => {
    const out = clampParts([part('a', 25, 40), part('b', 25, -3), part('c', 25, null)]);
    expect(out.map((p) => p.points)).toEqual([25, 0, null]);
  });
});

describe('score arithmetic', () => {
  it('Base is the rounded average: 80 and 70 give 75', () => {
    expect(baseScore(80, 70)).toBe(75);
    expect(baseScore(81, 70)).toBe(76); // 75.5 rounds up
  });
  it('spec example: 80/70, one contradicted + two unsupported => penalty 10, Final 65', () => {
    const claims = [claim('1', 'contradicted'), claim('2', 'unsupported'), claim('3', 'unsupported')];
    const s = computeReview(80, 70, claims);
    expect(s.base).toBe(75);
    expect(s.penalty).toBe(10);
    expect(s.final).toBe(65);
    expect(s.capped).toBe(false);
  });
  it('penalty never exceeds 25', () => {
    const claims = Array.from({ length: 10 }, (_, i) => claim(String(i), 'contradicted'));
    expect(claimPenaltyTotal(claims)).toBe(25);
    expect(computeReview(90, 90, claims).final).toBe(65);
  });
  it('Final never goes below 0', () => {
    const claims = Array.from({ length: 10 }, (_, i) => claim(String(i), 'contradicted'));
    expect(computeReview(10, 10, claims).final).toBe(0);
  });
  it('unverifiable claims cost 0 and do not count as checkable', () => {
    const claims = [claim('1', 'unverifiable'), claim('2', 'unverifiable'), claim('3', 'supported')];
    expect(claimPenaltyTotal(claims)).toBe(0);
    expect(checkableCount(claims)).toBe(1);
  });
  it('fewer than 3 checkable claims caps Final at 85', () => {
    const s = computeReview(100, 96, [claim('1', 'supported'), claim('2', 'unverifiable')]);
    expect(s.base).toBe(98);
    expect(s.uncappedFinal).toBe(98);
    expect(s.final).toBe(85);
    expect(s.capped).toBe(true);
  });
  it('3 checkable claims lifts the cap', () => {
    const claims = [claim('1', 'supported'), claim('2', 'supported'), claim('3', 'supported')];
    expect(computeReview(100, 100, claims).final).toBe(100);
  });
  it('no Final when a judge failed', () => {
    const s = computeReview(80, null, []);
    expect(s.final).toBeNull();
    expect(s.base).toBeNull();
  });
});

describe('fix ranking', () => {
  const repo: JudgeResult = {
    judge: 'repo', score: 60, evidenceLines: [],
    parts: [part('setup', 25, 10), part('structure', 25, 25), part('hygiene', 15, 12)],
  };
  const ui: JudgeResult = {
    judge: 'ui', score: 70, evidenceLines: [],
    parts: [part('first', 25, 5), part('states', 15, null), part('flow', 20, 18, false)],
  };
  const claims = [
    { ...claim('a', 'unsupported'), pointsLost: 2 },
    { ...claim('b', 'contradicted'), pointsLost: 6 },
    claim('c', 'supported'),
    claim('d', 'supported'),
  ];

  it('lists contradicted claims first, then others by points at stake', () => {
    const score = computeReview(60, 70, claims);
    const fixes = rankFixes(repo, ui, claims, score);
    expect(fixes[0].id).toBe('claim:b');
    expect(fixes.slice(1).map((f) => f.id)).toEqual(['ui:first', 'repo:setup', 'repo:hygiene', 'claim:a']);
    // "ui:first" 20 at stake > "repo:setup" 15 > "repo:hygiene" 3 > claim a 2
  });
  it('skips unobserved parts and parts with no evidence', () => {
    const ids = rankFixes(repo, ui, claims, computeReview(60, 70, claims)).map((f) => f.id);
    expect(ids).not.toContain('ui:states');
    expect(ids).not.toContain('ui:flow');
  });
  it('ignores part deductions smaller than 3 points', () => {
    const small: JudgeResult = { judge: 'repo', score: 98, evidenceLines: [], parts: [part('tiny', 25, 23)] };
    expect(rankFixes(small, null, [], computeReview(98, null, [])).length).toBe(0);
  });
  it('every fix carries evidence', () => {
    const fixes = rankFixes(repo, ui, claims, computeReview(60, 70, claims));
    expect(fixes.every((f) => f.evidence.length > 0)).toBe(true);
  });
  it('adds "add specifics" when fewer than 3 claims are checkable', () => {
    const few = [claim('x', 'supported')];
    const fixes = rankFixes(repo, ui, few, computeReview(100, 100, few));
    expect(fixes.some((f) => f.title === 'Add specifics')).toBe(true);
  });
  it('works with Judge II missing', () => {
    const fixes = rankFixes(repo, null, [], computeReview(60, null, []));
    expect(fixes.every((f) => f.raisedBy !== 'ui')).toBe(true);
  });
});
