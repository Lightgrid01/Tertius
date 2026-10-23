import {
  MIN_CHECKABLE, PENALTY_CAP, PENALTY_PER_STATUS, VAGUE_CAP,
  type Claim, type ClaimStatus, type Part, type ReviewScore,
} from './types';

/** Points a claim costs. Computed here, never by the model. */
export const claimPenalty = (status: ClaimStatus): number => PENALTY_PER_STATUS[status];

/** Clamp each part into 0..max. null stays null ("couldn't check"). */
export function clampParts(parts: Part[]): Part[] {
  return parts.map((p) => ({
    ...p,
    points: p.points === null ? null : Math.min(p.max, Math.max(0, Math.round(p.points))),
  }));
}

/**
 * Judge score on a 0-100 scale: observed points / observed maximum * 100.
 * With every part observed (Judge I always, Judge II usually) that is simply the sum of the parts.
 * Returns null if nothing could be observed.
 */
export function scoreFromParts(parts: Part[]): number | null {
  const observed = parts.filter((p) => p.points !== null);
  const max = observed.reduce((s, p) => s + p.max, 0);
  if (max === 0) return null;
  const got = observed.reduce((s, p) => s + (p.points as number), 0);
  return Math.round((got / max) * 100);
}

/** Base = average of Repo and UI, rounded to a whole number. */
export const baseScore = (repo: number, ui: number): number => Math.round((repo + ui) / 2);

/** Checkable = supported, unsupported or contradicted. Unverifiable does not count. */
export const checkableCount = (claims: Claim[]): number =>
  claims.filter((c) => c.status !== 'unverifiable').length;

/** 6 per contradicted + 2 per unsupported, capped at 25. */
export function claimPenaltyTotal(claims: Claim[]): number {
  const raw = claims.reduce((s, c) => s + claimPenalty(c.status), 0);
  return Math.min(PENALTY_CAP, raw);
}

/** Final = Base - penalty (never below 0); capped at 85 when fewer than 3 checkable claims. */
export function computeReview(
  repo: number | null,
  ui: number | null,
  claims: Claim[],
): ReviewScore {
  const checkable = checkableCount(claims);
  const penalty = claimPenaltyTotal(claims);
  if (repo === null || ui === null) {
    // Judge II (or Judge I) failed: partial result only, no Final.
    return { repo, ui, base: null, penalty, final: null, uncappedFinal: null, capped: false, checkable };
  }
  const base = baseScore(repo, ui);
  const uncappedFinal = Math.max(0, base - penalty);
  const vague = checkable < MIN_CHECKABLE;
  const final = vague ? Math.min(uncappedFinal, VAGUE_CAP) : uncappedFinal;
  return { repo, ui, base, penalty, final, uncappedFinal, capped: vague, checkable };
}
