import { z } from 'zod';
import type { Claim, ClaimCheckRequest, ClaimCheckResponse, ClaimSource, ClaimStatus, Evidence, JudgeResult } from '../src/shared/types';
import { claimPenalty } from '../src/shared/score';
import { ApiException, handle } from './_lib/http';
import { generateJson } from './_lib/gemini';
import { CLAIM_SYSTEM, claimPrompt } from './_lib/prompts';
import { verifyQuote, verifyQuotes, type Sources } from './_lib/verify-evidence';

const Ev = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quote'), source: z.string().max(200), quote: z.string().max(400) }),
  z.object({ type: z.literal('region'), ref: z.string().max(10) }),
]);
const ModelOut = z.object({
  claims: z.array(z.object({
    source: z.enum(['devpost', 'readme', 'github']), quote: z.string().max(400),
    status: z.enum(['supported', 'unsupported', 'contradicted', 'unverifiable']),
    note: z.string().max(500).default(''), evidence: z.array(Ev).max(4).default([]),
  })).max(14),
});

const Judge = z.object({ judge: z.enum(['repo', 'ui']), score: z.number(), parts: z.array(z.any()), evidenceLines: z.array(z.string()) }).passthrough();
const Body = z.object({
  devpostText: z.string().max(20000).optional(), readme: z.string().max(60000), description: z.string().max(1000).nullable(),
  repo: Judge, ui: Judge,
});

const MAX_CLAIMS = 10;

function describeFindings(j: JudgeResult, tag: (e: Evidence) => string): string {
  return j.parts.map((p) => {
    const pts = p.points === null ? `couldn't check (max ${p.max})` : `${p.points}/${p.max}`;
    const ev = p.evidence.map(tag).join(' ');
    return `- ${p.label}: ${pts}.${p.why ? ` ${p.why}` : ''} ${ev}`.trim();
  }).join('\n');
}

export const run = async (raw: ClaimCheckRequest): Promise<ClaimCheckResponse> => {
  const parsed = Body.safeParse(raw);
  if (!parsed.success) throw new ApiException('bad_input', 'Missing judge results.');
  const { devpostText, readme, description } = parsed.data;
  const repo = parsed.data.repo as unknown as JudgeResult;
  const ui = parsed.data.ui as unknown as JudgeResult;

  const claimSources: Sources = {};
  if (devpostText?.trim()) claimSources.devpost = devpostText;
  if (readme.trim()) claimSources.readme = readme;
  if (description?.trim()) claimSources.github = description;
  if (Object.keys(claimSources).length === 0) return { claims: [] };

  // Everything the model may quote as evidence: the claim sources plus what the judges already verified.
  const evidenceSources: Sources = { ...claimSources };
  const addTo = (k: string, t: string) => { evidenceSources[k] = `${evidenceSources[k] ?? ''}\n${t}`; };
  const regions = new Map<string, Evidence>();
  let r = 0;
  const tagFor = (judge: JudgeResult) => (e: Evidence): string => {
    if (e.kind === 'quote') { addTo(e.source, e.quote); return `[${e.source}] “${e.quote}”`; }
    if (e.kind === 'metric') { return `[metric] ${e.name}: ${e.value}`; }
    const id = `R${++r}`; regions.set(id, e); addTo('live page', e.note);
    return `(${id}: ${judge.judge === 'ui' ? 'screenshot' : ''} ${e.screenshot} region, ${e.note})`;
  };
  const repoFindings = `${describeFindings(repo, tagFor(repo))}\n${repo.evidenceLines.map((l) => `- ${l}`).join('\n')}`;
  const uiFindings = `${describeFindings(ui, tagFor(ui))}\n${ui.evidenceLines.map((l) => `- ${l}`).join('\n')}`;
  addTo('live page', `${ui.observedSummary ?? ''}\n${ui.evidenceLines.join('\n')}`);
  const regionList = [...regions].map(([id, e]) => `${id}: ${e.kind === 'region' ? `${e.screenshot} — ${e.note}` : ''}`).join('\n');

  const out = await generateJson({
    system: CLAIM_SYSTEM,
    prompt: claimPrompt({ sources: { devpost: claimSources.devpost, readme, github: description }, filesRead: repo.filesRead ?? [], repoFindings, uiSummary: ui.observedSummary ?? '', uiFindings, regions: regionList }),
    schema: ModelOut,
  });

  const claims: Claim[] = [];
  const seen = new Set<string>();
  for (const c of out.claims) {
    // The claim must really appear in a claim source (its own first).
    const own = claimSources[c.source] ? verifyQuote(c.quote, c.source, { [c.source]: claimSources[c.source] }) : null;
    const key = (own ?? verifyQuote(c.quote, c.source, claimSources)) as ClaimSource | null;
    if (!key) continue;
    const text = c.quote.replace(/\s+/g, ' ').trim();
    const dedupe = text.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const SELF = /^(devpost|readme|github)$|(^|\/)readme(\.[a-z]+)?$/i;
    const quotes = verifyQuotes(c.evidence.flatMap((e) => (e.type === 'quote' ? [{ source: e.source, quote: e.quote }] : [])), evidenceSources).filter((e) => e.kind !== 'quote' || !SELF.test(e.source));
    const regs = c.evidence.flatMap((e) => (e.type === 'region' && regions.get(e.ref) ? [regions.get(e.ref)!] : []));
    const evidence = [...quotes, ...regs];
    const note = c.note.trim();

    let status: ClaimStatus = c.status;
    // Rules enforced in code, not trusted to the model.
    if (status === 'supported' && evidence.length === 0) status = 'unverifiable';
    if (status === 'contradicted' && evidence.length === 0) status = note.length >= 10 ? 'unsupported' : 'unverifiable';
    if (status === 'unsupported' && note.length < 10) status = 'unverifiable';

    claims.push({ id: `c${claims.length + 1}`, text, source: key, status, evidence, pointsLost: claimPenalty(status), ...(note ? { note } : {}) });
    if (claims.length >= MAX_CLAIMS) break;
  }
  return { claims };
};

export default handle<ClaimCheckRequest, ClaimCheckResponse>(run);
