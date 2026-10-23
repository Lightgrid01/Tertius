import { z } from 'zod';
import type { Evidence, JudgeRepoRequest, JudgeRepoResponse, Part } from '../src/shared/types';
import { clampParts, scoreFromParts } from '../src/shared/score';
import { ApiException, handle } from './_lib/http';
import { getCommits, getFile, getReadme, getTree } from './_lib/github';
import { FILE_LIMIT, PER_FILE_CHARS, TOTAL_CHARS, computeFacts, pickFiles, type RepoFacts } from './_lib/secrets-scan';
import { generateJson } from './_lib/gemini';
import { REPO_RUBRIC, REPO_SYSTEM, repoPrompt } from './_lib/prompts';
import { verifyQuotes, type Sources } from './_lib/verify-evidence';
import { historyPart, hygieneChecks, partFromChecks, setupChecks } from './_lib/repo-checks';

const Body = z.object({
  owner: z.string().regex(/^[A-Za-z0-9-]{1,39}$/), repo: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
  defaultBranch: z.string().min(1).max(100), description: z.string().nullable(),
});
const KEYS = ['structure', 'functionality'] as const;
const ModelOut = z.object({
  parts: z.array(z.object({
    key: z.enum(KEYS), points: z.number(), advice: z.string().max(160).default(''), why: z.string().max(500).default(''),
    evidence: z.array(z.object({ source: z.string(), quote: z.string() })).max(4).default([]),
  })).length(2),
  evidenceLines: z.array(z.string().max(300)).min(1).max(4),
});

const README_CHARS = 24000;

export const run = async (raw: JudgeRepoRequest): Promise<JudgeRepoResponse> => {
  const parsed = Body.safeParse(raw);
  if (!parsed.success) throw new ApiException('bad_input', 'Missing repository details.');
  const { owner, repo, defaultBranch, description } = parsed.data;

  const readmeFull = await getReadme(owner, repo);
  const tree = await getTree(owner, repo, defaultBranch);
  const commits = await getCommits(owner, repo);
  const readme = readmeFull.text.slice(0, README_CHARS);
  const picked = pickFiles(tree.entries).slice(0, FILE_LIMIT);

  let budget = TOTAL_CHARS;
  const files: { path: string; text: string; truncated: boolean }[] = [];
  // A few files at a time: many parallel requests overload weaker connections.
  const fetched: { path: string; text: string | null }[] = [];
  for (let i = 0; i < picked.length; i += 4) {
    fetched.push(...(await Promise.all(picked.slice(i, i + 4).map(async (p) => ({ path: p, text: await getFile(owner, repo, p, defaultBranch) })))));
  }
  for (const f of fetched) {
    if (f.text === null || budget <= 0) continue;
    const cut = f.text.slice(0, Math.min(PER_FILE_CHARS, budget));
    budget -= cut.length;
    files.push({ path: f.path, text: cut, truncated: cut.length < f.text.length });
  }

  const pkg = files.find((f) => f.path === 'package.json');
  const pkgTest = !!pkg && /"test"\s*:\s*"(?!echo \\"Error: no test)/.test(pkg.text);
  // Secret scan covers what was read; README is included so pasted keys are caught too.
  const facts = computeFacts(tree.entries, tree.truncated, [...files, { path: readmeFull.path, text: readme }], commits, pkgTest);

  if (!readme && files.length === 0 && tree.entries.length === 0) throw new ApiException('failed', 'The repository is empty.');

  const out = await generateJson({
    system: REPO_SYSTEM,
    prompt: repoPrompt({ description, readmePath: readmeFull.path, readme, paths: tree.entries.map((t) => t.path).slice(0, 400), treeTruncated: tree.truncated, facts, files }),
    schema: ModelOut,
  });

  // Quotes must appear in what the model was given.
  const sources: Sources = { [readmeFull.path]: readme, ...Object.fromEntries(files.map((f) => [f.path, f.text])) };
  if (description) sources.description = description;

  const byKey = new Map(out.parts.map((p) => [p.key as string, p]));
  if (byKey.size !== 2) throw new ApiException('failed', 'The model skipped a part. Retry.');
  let verifiedQuotes = 0;
  const label = (k: string) => REPO_RUBRIC.find((r) => r.key === k)!;
  const modelPart = (key: 'structure' | 'functionality'): Part => {
    const r = label(key), m = byKey.get(key)!;
    const quotes = verifyQuotes(m.evidence, sources);
    verifiedQuotes += quotes.length;
    const stub: Evidence[] = key === 'functionality' && facts.stubMarkers + facts.todoMarkers > 0
      ? [{ kind: 'metric', name: 'Stub / TODO markers in files read', value: String(facts.stubMarkers + facts.todoMarkers) }] : [];
    return { key, label: r.label, max: r.max, points: Math.min(r.max, Math.max(0, Math.round(m.points))), advice: m.advice || undefined, why: m.why || undefined, evidence: [...stub, ...quotes] };
  };
  // Setup, hygiene and history are computed by code so the same repo always scores the same.
  const parts: Part[] = [
    partFromChecks('setup', label('setup').label, setupChecks(readme, tree.entries, facts)),
    modelPart('structure'),
    modelPart('functionality'),
    partFromChecks('hygiene', label('hygiene').label, hygieneChecks(tree.entries, facts)),
    historyPart(facts),
  ];
  if (verifiedQuotes === 0) throw new ApiException('no_verified_evidence', 'None of the quotes could be verified against the repository. Retry.');

  const clamped = clampParts(parts);
  const lines = out.evidenceLines.slice(0, 3);
  while (lines.length < 2) lines.push(parts.filter((p) => (p.points ?? 0) < p.max && p.advice).map((p) => p.advice!)[lines.length - 1] ?? `${facts.commitCount} commits read, ${files.length} files sampled.`);

  return {
    result: { judge: 'repo', score: scoreFromParts(clamped) ?? 0, parts: clamped, evidenceLines: lines, filesRead: [readmeFull.path, ...files.map((f) => f.path)].filter((p, i, a) => p && a.indexOf(p) === i) },
    readme,
    description,
  };
};

export default handle<JudgeRepoRequest, JudgeRepoResponse>(run);
