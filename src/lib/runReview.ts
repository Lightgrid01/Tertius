import { useCallback, useRef, useState } from 'react';
import { api, ApiCallError } from './api';
import { classifyDevpost, normalizeLiveUrl } from './url';
import type { ApiError } from '../shared/types';
import { emptySlot, type Inputs, type RunState } from './runTypes';
import { USE_FIXTURES, sampleData } from '../fixtures';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const blank = (inputs: Inputs): RunState => ({
  inputs, phase: 'checking', repo: emptySlot(), ui: emptySlot(), claims: emptySlot(),
});

/** Sample states for UI development: add #sample-running, #sample-partial, #sample-failed or #sample-review. */
export function sampleRun(kind: string): RunState | null {
  const inputs: Inputs = { repoUrl: 'github.com/sample/ledgerlight', liveUrl: 'ledgerlight.example.app', devpost: '' };
  const now = Date.now();
  const repoDone = { status: 'done' as const, startedAt: now - 41000, data: { result: sampleData.repo, readme: sampleData.readme, description: sampleData.description } };
  const uiDone = { status: 'done' as const, startedAt: now - 52000, data: { result: sampleData.ui } };
  const base = { inputs, sample: true, check: { owner: 'sample', repo: 'ledgerlight', description: sampleData.description, defaultBranch: 'main' } };
  switch (kind) {
    case 'running':
      return { ...base, phase: 'judging', repo: { status: 'reviewing', startedAt: now - 14000 }, ui: { status: 'reviewing', startedAt: now - 14000 }, claims: emptySlot() };
    case 'partial':
      return { ...base, phase: 'judging', repo: repoDone, ui: { status: 'failed', error: { error: 'live_ui_failed', message: 'The page didn’t respond in time.' } }, claims: emptySlot() };
    case 'failed':
      return { ...base, phase: 'judging', repo: { status: 'failed', error: { error: 'rate_limited', message: 'The model is busy. Your inputs are kept.' } }, ui: { status: 'reviewing', startedAt: now - 20000 }, claims: emptySlot() };
    case 'claims':
      return { ...base, phase: 'claims', repo: repoDone, ui: uiDone, claims: { status: 'reviewing', startedAt: now } };
    case 'review':
      return { ...base, phase: 'done', repo: repoDone, ui: uiDone, claims: { status: 'done', data: { claims: sampleData.claims } } };
    default:
      return null;
  }
}

const toApiError = (e: unknown): ApiError =>
  e instanceof ApiCallError ? e.api : { error: 'failed', message: 'Something went wrong. Retry.' };

export function useReview() {
  const [run, setRun] = useState<RunState | null>(() => {
    const m = window.location.hash.match(/^#sample-(\w+)/);
    return USE_FIXTURES && m ? sampleRun(m[1]) : null;
  });
  const token = useRef(0);
  const ref = useRef<RunState | null>(run); // always the latest state, readable synchronously

  /** Apply a change to the current run, unless the person has since reset or started another review. */
  const update = useCallback((id: number, fn: (r: RunState) => RunState) => {
    if (token.current !== id || !ref.current) return;
    ref.current = fn(ref.current);
    setRun(ref.current);
  }, []);

  const runRepo = useCallback(async (id: number) => {
    const r = ref.current; if (!r?.check) return;
    update(id, (x) => ({ ...x, repo: { status: 'reviewing', startedAt: Date.now() } }));
    try {
      const data = await api.judgeRepo({ owner: r.check.owner, repo: r.check.repo, defaultBranch: r.check.defaultBranch, description: r.check.description });
      update(id, (x) => ({ ...x, repo: { status: 'done', startedAt: x.repo.startedAt, data } }));
    } catch (e) {
      update(id, (x) => ({ ...x, repo: { status: 'failed', startedAt: x.repo.startedAt, error: toApiError(e) } }));
    }
  }, [update]);

  const runUi = useCallback(async (id: number) => {
    const r = ref.current; if (!r) return;
    update(id, (x) => ({ ...x, ui: { status: 'reviewing', startedAt: Date.now() } }));
    try {
      const data = await api.judgeUi({ liveUrl: normalizeLiveUrl(r.inputs.liveUrl) ?? r.inputs.liveUrl });
      update(id, (x) => ({ ...x, ui: { status: 'done', startedAt: x.ui.startedAt, data } }));
    } catch (e) {
      update(id, (x) => ({ ...x, ui: { status: 'failed', startedAt: x.ui.startedAt, error: toApiError(e) } }));
    }
  }, [update]);

  /** Runs only when both judges are done, and only once per attempt. */
  const runClaims = useCallback(async (id: number) => {
    const r = ref.current;
    if (!r || r.repo.status !== 'done' || r.ui.status !== 'done' || r.claims.status === 'reviewing' || r.claims.status === 'done') return;
    update(id, (x) => ({ ...x, phase: 'claims', claims: { status: 'reviewing', startedAt: Date.now() } }));
    try {
      const data = await api.claimCheck({
        devpostText: r.check?.devpostText, readme: r.repo.data!.readme, description: r.repo.data!.description,
        repo: r.repo.data!.result, ui: r.ui.data!.result,
      });
      update(id, (x) => ({ ...x, claims: { status: 'done', data } }));
      await sleep(700); // let the third step land before the review page replaces it
      update(id, (x) => ({ ...x, phase: 'done' }));
    } catch (e) {
      update(id, (x) => ({ ...x, phase: 'judging', claims: { status: 'failed', error: toApiError(e) } }));
    }
  }, [update]);

  const start = useCallback(async (inputs: Inputs) => {
    const id = ++token.current;
    ref.current = blank(inputs);
    setRun(ref.current);

    if (USE_FIXTURES) {
      // Labelled sample run: no network, no quota. Never used for a real review.
      const step = async (ms: number, fn: (r: RunState) => RunState) => { await sleep(ms); update(id, fn); };
      await step(500, (r) => ({ ...r, sample: true, phase: 'judging', repo: { status: 'reviewing', startedAt: Date.now() }, ui: { status: 'reviewing', startedAt: Date.now() } }));
      await step(2600, (r) => ({ ...r, repo: { status: 'done', startedAt: r.repo.startedAt, data: { result: sampleData.repo, readme: sampleData.readme, description: sampleData.description } } }));
      await step(1700, (r) => ({ ...r, phase: 'claims', ui: { status: 'done', startedAt: r.ui.startedAt, data: { result: sampleData.ui } }, claims: { status: 'reviewing', startedAt: Date.now() } }));
      await step(1800, (r) => ({ ...r, claims: { status: 'done', data: { claims: sampleData.claims } } }));
      await step(700, (r) => ({ ...r, phase: 'done' }));
      return;
    }

    const dev = classifyDevpost(inputs.devpost);
    try {
      const check = await api.checkInputs({ repoUrl: inputs.repoUrl, ...(dev.kind === 'none' ? {} : { devpost: inputs.devpost }) });
      update(id, (r) => ({ ...r, phase: 'judging', check }));
    } catch (e) {
      // Bad or private repo, unreadable Devpost link, or a service problem: back to the landing screen with inputs kept.
      update(id, (r) => ({ ...r, phase: 'blocked', checkError: toApiError(e) }));
      return;
    }
    // Both judges start together; each one reports on its own.
    await Promise.all([runRepo(id), runUi(id)]);
    await runClaims(id);
  }, [update, runRepo, runUi, runClaims]);

  const retry = useCallback(async (which: 'repo' | 'ui' | 'claims') => {
    const id = token.current;
    if (USE_FIXTURES || !ref.current) return;
    if (which === 'repo') await runRepo(id);
    else if (which === 'ui') await runUi(id);
    await runClaims(id); // no-op unless both judges are now done
  }, [runRepo, runUi, runClaims]);

  const reset = useCallback(() => {
    token.current++;
    window.location.hash = '';
    const r = ref.current;
    ref.current = r ? { ...blank(r.inputs), phase: 'blocked' } : null;
    setRun(ref.current);
  }, []);

  return { run, start, retry, reset };
}
