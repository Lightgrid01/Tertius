import type { Claim, Fix, JudgeResult, ReviewScore } from './types';

/** Part deductions smaller than this are noise, not fixes. */
export const MIN_PART_FIX_POINTS = 3;

const RAISED_ORDER = { claims: 0, repo: 1, ui: 2 } as const;

function claimFix(c: Claim): Fix {
  const quote = { kind: 'quote' as const, source: c.source, quote: c.text };
  const short = c.text.length > 90 ? `${c.text.slice(0, 87).trimEnd()}…` : c.text;
  return {
    id: `claim:${c.id}`,
    title: c.status === 'contradicted' ? `Fix or cut: “${short}”` : `Back up: “${short}”`,
    detail: c.note,
    raisedBy: 'claims',
    pointsAtStake: c.pointsLost,
    evidence: [quote, ...c.evidence],
  };
}

function partFixes(r: JudgeResult | null): Fix[] {
  if (!r) return [];
  const out: Fix[] = [];
  for (const p of r.parts) {
    if (p.points === null) continue; // couldn't check: nothing to fix
    const lost = p.max - p.points;
    if (lost < MIN_PART_FIX_POINTS || p.evidence.length === 0) continue; // every finding needs evidence
    out.push({
      id: `${r.judge}:${p.key}`,
      title: p.advice ?? `Raise “${p.label}”`,
      detail: p.why,
      raisedBy: r.judge,
      pointsAtStake: lost,
      evidence: p.evidence,
    });
  }
  return out;
}

/**
 * Contradicted claims first, then everything else by points at stake (highest first).
 * Ties: claims, then repo, then ui, then id, so the order is stable.
 */
export function rankFixes(
  repo: JudgeResult | null,
  ui: JudgeResult | null,
  claims: Claim[],
  score: ReviewScore,
): Fix[] {
  const contradicted = claims.filter((c) => c.status === 'contradicted').map(claimFix);
  const rest: Fix[] = [
    ...claims.filter((c) => c.status === 'unsupported').map(claimFix),
    ...partFixes(repo),
    ...partFixes(ui),
  ];
  if (score.capped) {
    rest.push({
      id: 'claims:add-specifics',
      title: 'Add specifics',
      detail: 'Fewer than 3 claims could be checked, so the Final score is capped at 85. Name concrete features, numbers or behaviours a judge can verify.',
      raisedBy: 'claims',
      pointsAtStake: Math.max(0, (score.uncappedFinal ?? 0) - (score.final ?? 0)),
      evidence: [{ kind: 'metric', name: 'Checkable claims', value: `${score.checkable} of 3 needed` }],
    });
  }
  rest.sort(
    (a, b) =>
      b.pointsAtStake - a.pointsAtStake ||
      RAISED_ORDER[a.raisedBy] - RAISED_ORDER[b.raisedBy] ||
      a.id.localeCompare(b.id),
  );
  return [...contradicted, ...rest];
}
