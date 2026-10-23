import type { Evidence } from '../../src/shared/types';

/** Collapse whitespace and normalise typographic quotes/dashes so a quote survives line-wrapping. */
export function norm(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

export type Sources = Record<string, string>;

const MAX_QUOTE = 320;
const MIN_QUOTE = 6;

/**
 * A quote is kept only if it appears in the source text the model was given.
 * Returns the source key it was actually found in (the claimed one first), or null to drop it.
 */
export function verifyQuote(quote: string, claimed: string, sources: Sources): string | null {
  const q = norm(quote);
  if (q.length < MIN_QUOTE || quote.length > MAX_QUOTE) return null;
  const keys = Object.keys(sources);
  const exact = keys.find((k) => k === claimed) ?? keys.find((k) => k.toLowerCase() === claimed.toLowerCase())
    ?? keys.find((k) => k.endsWith(`/${claimed}`) || claimed.endsWith(`/${k}`));
  const order = exact ? [exact, ...keys.filter((k) => k !== exact)] : keys;
  for (const k of order) if (norm(sources[k]).includes(q)) return k;
  return null;
}

/** A region is kept only if its box lies inside the image (fractions 0..1, width and height > 0). */
export function verifyBox(box: number[]): [number, number, number, number] | null {
  if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = box;
  const eps = 0.005;
  if (x < -eps || y < -eps || w <= 0.005 || h <= 0.005 || x + w > 1 + eps || y + h > 1 + eps) return null;
  const cx = Math.max(0, x), cy = Math.max(0, y);
  return [cx, cy, Math.min(w, 1 - cx), Math.min(h, 1 - cy)];
}

/** Keep only verified quotes. Duplicates are removed. */
export function verifyQuotes(items: { source: string; quote: string }[], sources: Sources): Evidence[] {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const it of items) {
    const key = verifyQuote(it.quote, it.source, sources);
    if (!key) continue;
    const quote = it.quote.replace(/\s+/g, ' ').trim();
    const id = `${key}|${norm(quote)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ kind: 'quote', source: key, quote });
  }
  return out;
}
